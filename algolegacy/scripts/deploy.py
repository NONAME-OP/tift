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

import os, sys, json, base64, pathlib
from dotenv import load_dotenv
from algosdk import mnemonic, account
from algosdk.v2client import algod as algod_client_module
from algosdk.transaction import (
    ApplicationCreateTxn, StateSchema, wait_for_confirmation, OnComplete
)

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
NETWORK = os.getenv("NETWORK", "testnet")

ALGOD_SERVERS = {
    "testnet":  ("https://testnet-api.algonode.cloud", 443, ""),
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
    """Compile TEAL source and return raw bytes."""
    response = algod.compile(source)
    return base64.b64decode(response["result"])


def main():
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

    artifacts = pathlib.Path(__file__).parent.parent / "contracts" / "artifacts"
    approval_teal = (artifacts / "AlgoLegacy.approval.teal").read_text()
    clear_teal    = (artifacts / "AlgoLegacy.clear.teal").read_text()

    # Build algod client
    url = f"{algod_server}:{algod_port}"
    algod = algod_client_module.AlgodClient(algod_token, url, headers={"User-Agent": "algosdk"})

    print(f"\n🚀 Deploying AlgoLegacy to {NETWORK.upper()}...")
    print(f"   Deployer : {address}")

    # Check balance
    try:
        info = algod.account_info(address)
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

    # State schema (exact count from algolegacy.py):
    #   Uint64 (11): inactivity_period, last_checkin, inheritance_active, total_locked,
    #               will_created, b1_percent, b1_claimed, b2_percent, b2_claimed,
    #               b3_percent, b3_claimed
    #   Bytes  (4) : owner, b1_address, b2_address, b3_address
    global_schema = StateSchema(num_uints=11, num_byte_slices=4)
    local_schema  = StateSchema(num_uints=0, num_byte_slices=0)

    sp = algod.suggested_params()

    txn = ApplicationCreateTxn(
        sender=address,
        sp=sp,
        on_complete=OnComplete.NoOpOC,
        approval_program=approval_bytes,
        clear_program=clear_bytes,
        global_schema=global_schema,
        local_schema=local_schema,
    )

    signed_txn = txn.sign(private_key)
    txid = algod.send_transaction(signed_txn)

    print(f"   Tx sent  : {txid}")
    print("   Waiting for confirmation...")

    result = wait_for_confirmation(algod, txid, wait_rounds=5)
    app_id   = result["application-index"]
    import algosdk.encoding as enc
    app_addr = enc.encode_address(enc.checksum(b"appID" + app_id.to_bytes(8, "big")))

    print("\n" + "═" * 60)
    print("  ✅ Contract deployed!")
    print(f"  📌 App ID       : {app_id}")
    print(f"  📦 App Address  : {app_addr}")
    print(f"  🔗 Tx ID        : {txid}")
    print(f"  🌐 Explorer     : https://testnet.algoexplorer.io/application/{app_id}")
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

