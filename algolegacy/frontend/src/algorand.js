// ─────────────────────────────────────────────────────────────────────────────
// algorand.js — Utility layer for all Algorand / smart contract interactions
// ─────────────────────────────────────────────────────────────────────────────
import algosdk from "algosdk";

// ── Network config ────────────────────────────────────────────────────────────
// Update APP_ID after deploying with `algokit deploy testnet`
export const APP_ID = Number(process.env.REACT_APP_APP_ID) || 0;

const ALGOD_TOKEN  = "";
const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_PORT   = 443;

const INDEXER_TOKEN  = "";
const INDEXER_SERVER = "https://testnet-idx.algonode.cloud";
const INDEXER_PORT   = 443;

export const algodClient   = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
export const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, INDEXER_PORT);

export const EXPLORER_BASE = "https://testnet.algoexplorer.io";

// ── Micro-ALGO helpers ────────────────────────────────────────────────────────
export const toAlgo  = (micro) => (micro / 1_000_000).toFixed(4);
export const toMicro = (algo)  => Math.floor(Number(algo) * 1_000_000);

// ── ABI Method helpers ────────────────────────────────────────────────────────
// We construct method call transactions manually so we don't need a bundled ABI JSON.

/**
 * Encode an ABI method call and send it.
 * Returns { txId, confirmedRound }
 */
export async function callMethod({ sender, signer, methodName, methodArgs, appId, payment }) {
  const sp     = await algodClient.getTransactionParams().do();
  const appRef = algosdk.getApplicationAddress(appId);

  // Build method selector
  const method  = algosdk.ABIMethod.fromSignature(ABI_SIGNATURES[methodName]);
  const atc     = new algosdk.AtomicTransactionComposer();

  const txnArgs = { ...defaultCallArgs(sender, sp, appId) };

  if (payment) {
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from:   sender,
      to:     appRef,
      amount: payment,
      suggestedParams: { ...sp, fee: 1000, flatFee: true },
    });
    const payWithSigner = { txn: payTxn, signer };
    atc.addMethodCall({
      ...txnArgs,
      method,
      methodArgs: [...methodArgs, payWithSigner],
      signer,
    });
  } else {
    atc.addMethodCall({ ...txnArgs, method, methodArgs, signer });
  }

  const result = await atc.execute(algodClient, 4);
  return {
    txId: result.txIDs[0],
    returnValue: result.methodResults[0]?.returnValue,
  };
}

function defaultCallArgs(sender, sp, appId) {
  return {
    appID: appId,
    sender,
    suggestedParams: { ...sp, fee: 2000, flatFee: true },
  };
}

// ── ABI Method signatures ─────────────────────────────────────────────────────
// Derived from the contract. Keep in sync with algolegacy.py.
export const ABI_SIGNATURES = {
  create_will:           "create_will(uint64,address,uint64,address,uint64,address,uint64)string",
  deposit:               "deposit(pay)uint64",
  check_in:              "check_in()uint64",
  activate_inheritance:  "activate_inheritance()string",
  force_activate:        "force_activate()string",
  claim:                 "claim(uint64)uint64",
  revoke_will:           "revoke_will()string",
  get_will_status:       "get_will_status()string",
  get_time_remaining:    "get_time_remaining()uint64",
  get_locked_balance:    "get_locked_balance()uint64",
};

// ── Read contract state ───────────────────────────────────────────────────────
export async function getAppGlobalState(appId) {
  if (!appId) return null;
  try {
    const info = await algodClient.getApplicationByID(appId).do();
    const raw  = info.params["global-state"] || [];
    const state = {};
    raw.forEach(({ key, value }) => {
      const k = atob(key);
      if (value.type === 1) {
        // bytes — try to decode as address (32 bytes), else keep as base64
        try {
          const bytes = Uint8Array.from(atob(value.bytes), c => c.charCodeAt(0));
          state[k] = bytes.length === 32 ? algosdk.encodeAddress(bytes) : value.bytes;
        } catch {
          state[k] = value.bytes;
        }
      } else {
        state[k] = value.uint;
      }
    });

    // Map contract state keys to friendly names for the UI
    const s = {
      will_created:          state["will_created"]       ?? 0,
      inheritance_active:    state["inheritance_active"] ?? 0,
      total_locked:          state["total_locked"]       ?? 0,
      last_checkin:          state["last_checkin"]       ?? 0,
      inactivity_period:     state["inactivity_period"]  ?? 0,
      owner:                 state["owner"]              ?? "",
      beneficiary1_address:  state["b1_address"]         ?? "",
      beneficiary1_percent:  state["b1_percent"]         ?? 0,
      beneficiary1_claimed:  state["b1_claimed"]         ?? 0,
      beneficiary2_address:  state["b2_address"]         ?? "",
      beneficiary2_percent:  state["b2_percent"]         ?? 0,
      beneficiary2_claimed:  state["b2_claimed"]         ?? 0,
      beneficiary3_address:  state["b3_address"]         ?? "",
      beneficiary3_percent:  state["b3_percent"]         ?? 0,
      beneficiary3_claimed:  state["b3_claimed"]         ?? 0,
    };

    // Compute time_remaining client-side (no extra ABI call needed)
    const nowSec  = Math.floor(Date.now() / 1000);
    const deadline = Number(s.last_checkin) + Number(s.inactivity_period);
    s.time_remaining = Math.max(0, deadline - nowSec);

    return s;
  } catch (err) {
    console.error("getAppGlobalState error", err);
    return null;
  }
}

// ── Simulated read-only call ──────────────────────────────────────────────────
export async function readMethod(sender, methodName, appId, args = []) {
  const sp     = await algodClient.getTransactionParams().do();
  const method = algosdk.ABIMethod.fromSignature(ABI_SIGNATURES[methodName]);
  const atc    = new algosdk.AtomicTransactionComposer();

  // Use a fake signer for simulation
  const fakeSigner = algosdk.makeBasicAccountTransactionSigner(
    algosdk.mnemonicToSecretKey("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon invest")
  );

  atc.addMethodCall({
    appID: appId,
    sender,
    suggestedParams: { ...sp, fee: 1000, flatFee: true },
    method,
    methodArgs: args,
    signer: fakeSigner,
  });

  const simResult = await atc.simulate(algodClient);
  return simResult.methodResults[0]?.returnValue;
}
