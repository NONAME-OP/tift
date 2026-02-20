"""
deploy.py — AlgoLegacy contract deployment script
==================================================
Usage:
    python scripts/deploy.py

Requirements:
    pip install beaker-pyteal algokit-utils python-dotenv algosdk
    ALGO_MNEMONIC env var must be set (or use .env file)

After deploy, copy the printed APP_ID into frontend/.env:
    REACT_APP_APP_ID=<your-app-id>
"""

import os, sys, json, base64, pathlib, time, math, functools
from dotenv import load_dotenv
from algosdk import mnemonic, account
from algosdk.v2client import algod as algod_client_module
from algosdk.transaction import (
    ApplicationCreateTxn, StateSchema, wait_for_confirmation, OnComplete
)
from algosdk.error import AlgodHTTPError

# ── Rate-limit helpers ────────────────────────────────────────────────────────
# AlgoNode free tier: ~1 req/s on algod; add backoff on HTTP 429.
_CALL_DELAY = 0.5          # seconds between sequential API calls
_MAX_RETRIES = 5
_BACKOFF_BASE = 2          # exponential base (2 ** attempt seconds)

def _retry_on_429(fn, *args, **kwargs):
    """Call fn(*args, **kwargs) retrying up to _MAX_RETRIES times on HTTP 429."""
    for attempt in range(_MAX_RETRIES):
        try:
            result = fn(*args, **kwargs)
            time.sleep(_CALL_DELAY)   # polite pause after every successful call
            return result
        except AlgodHTTPError as exc:
            if "429" in str(exc) or getattr(exc, "code", None) == 429:
                wait = _BACKOFF_BASE ** attempt
                print(f"   ⏳ Rate limited – retrying in {wait}s (attempt {attempt+1}/{_MAX_RETRIES})...")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("AlgoNode rate limit: max retries exceeded")

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
NETWORK = os.getenv("NETWORK", "testnet")

ALGOD_SERVERS = {
    "testnet":  ("https://testnet-api.algonode.network", "", ""),
    "localnet": ("http://localhost", 4001, "a" * 64),
}

if NETWORK not in ALGOD_SERVERS:
    sys.exit(f"Unsupported network: {NETWORK}")

algod_server, algod_port, algod_token = ALGOD_SERVERS[NETWORK]

# ── Load deployer account ──────────────────────────────────────────────────────
raw_mnemonic = os.getenv("ALGO_MNEMONIC")
if not raw_mnemonic:
    sys.exit(
        "❌  ALGO_MNEMONIC environment variable not set.\n"
        "    Export your 25-word mnemonic:\n"
        "    set ALGO_MNEMONIC=word1 word2 ... word25"
    )

private_key = mnemonic.to_private_key(raw_mnemonic)
address     = account.address_from_private_key(private_key)


def compile_program(algod, source: str) -> bytes:
    """Compile TEAL source and return raw bytes (rate-limit safe)."""
    response = _retry_on_429(algod.compile, source)
    return base64.b64decode(response["result"])


def main():
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

    artifacts = pathlib.Path(__file__).parent.parent / "contracts" / "artifacts"
    approval_teal = (artifacts / "AlgoLegacy.approval.teal").read_text()
    clear_teal    = (artifacts / "AlgoLegacy.clear.teal").read_text()

    # Build algod client
    url = algod_server if not algod_port else f"{algod_server}:{algod_port}"
    headers = {"User-Agent": "algosdk", "x-api-key": algod_token} if algod_token else {"User-Agent": "algosdk"}
    algod = algod_client_module.AlgodClient(algod_token, url, headers=headers)

    print(f"\n🚀 Deploying AlgoLegacy to {NETWORK.upper()}...")
    print(f"   Deployer : {address}")

    # Check balance
    try:
        info = _retry_on_429(algod.account_info, address)
        balance_algo = info.get("amount", 0) / 1_000_000
        print(f"   Balance  : {balance_algo:.4f} ALGO")
        if balance_algo < 0.2:
            sys.exit(
                "\n❌  Insufficient balance. Need at least 0.2 ALGO.\n"
                f"   Fund this address: {address}\n"
                "   Testnet dispenser: https://dispenser.testnet.aws.algodev.network\n"
            )
    except Exception as e:
        sys.exit(f"❌  Cannot reach Algorand node: {e}")

    # Compile TEAL
    print("   Compiling approval program...")
    approval_bytes = compile_program(algod, approval_teal)
    print("   Compiling clear program...")
    clear_bytes    = compile_program(algod, clear_teal)

    # Extra program pages: each page = 2048 bytes (max 3 extra pages)
    extra_pages = max(0, math.ceil(len(approval_bytes) / 2048) - 1)
    if extra_pages > 0:
        print(f"   Program size : {len(approval_bytes)} bytes — using {extra_pages} extra page(s)")

    # State schema (exact count from algolegacy.py):
    #   Uint64 (18): inactivity_period, last_checkin, inheritance_active, total_locked,
    #                will_created, b1_percent, b1_claimed, b2_percent, b2_claimed,
    #                b3_percent, b3_claimed,
    #                locked_asa_id, b1_asa_amount, b1_asa_claimed,
    #                b2_asa_amount, b2_asa_claimed, b3_asa_amount, b3_asa_claimed
    #   Bytes  (4) : owner, b1_address, b2_address, b3_address
    global_schema = StateSchema(num_uints=18, num_byte_slices=4)
    local_schema  = StateSchema(num_uints=0, num_byte_slices=0)

    sp = _retry_on_429(algod.suggested_params)

    txn = ApplicationCreateTxn(
        sender=address,
        sp=sp,
        on_complete=OnComplete.NoOpOC,
        approval_program=approval_bytes,
        clear_program=clear_bytes,
        global_schema=global_schema,
        local_schema=local_schema,
        extra_pages=extra_pages,
    )

    signed_txn = txn.sign(private_key)
    txid = _retry_on_429(algod.send_transaction, signed_txn)

    print(f"   Tx sent  : {txid}")
    print("   Waiting for confirmation...")

    result = wait_for_confirmation(algod, txid, wait_rounds=8)
    app_id   = result["application-index"]
    import algosdk.encoding as enc
    app_addr = enc.encode_address(enc.checksum(b"appID" + app_id.to_bytes(8, "big")))

    print("\n" + "═" * 60)
    print("  ✅ Contract deployed!")
    print(f"  📌 App ID       : {app_id}")
    print(f"  📦 App Address  : {app_addr}")
    print(f"  🔗 Tx ID        : {txid}")
    print(f"  🌐 Explorer     : https://testnet.explorer.perawallet.app/application/{app_id}")
    print("═" * 60)
    print("\nNext steps:")
    print("  1. Fund the app address with at least 0.5 ALGO for inner txn fees:")
    print(f"     Send ALGO to {app_addr}")
    print("  2. Update frontend/.env:")
    print(f"     REACT_APP_APP_ID={app_id}")
    print("  3. Restart the frontend (Ctrl+C then npm start)\n")

    # Write app ID to artifacts
    out = artifacts
    out.mkdir(exist_ok=True)
    (out / "deployed.json").write_text(json.dumps({
        "network": NETWORK,
        "app_id": app_id,
        "app_address": app_addr,
        "deploy_txid": txid,
        "deployer": address,
    }, indent=2))
    print("  Saved to contracts/artifacts/deployed.json")

    return app_id, app_addr


if __name__ == "__main__":
    main()

