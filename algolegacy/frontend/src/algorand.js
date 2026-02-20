// ─────────────────────────────────────────────────────────────────────────────
// algorand.js — Utility layer for all Algorand / smart contract interactions
// ─────────────────────────────────────────────────────────────────────────────
import algosdk from "algosdk";

// ── Network config ────────────────────────────────────────────────────────────
// APP_ID kept for backward-compat; multi-will support uses localStorage instead.
export const APP_ID = Number(process.env.REACT_APP_APP_ID) || 0;

const ALGOD_TOKEN  = "";
const ALGOD_SERVER = "https://testnet-api.algonode.network";
const ALGOD_PORT   = "";

// Fallback algod in case primary rate-limits
const ALGOD_SERVER_BACKUP = "https://testnet-api.4160.nodely.dev";

const INDEXER_TOKEN  = "";
const INDEXER_SERVER = "https://testnet-idx.algonode.network";
const INDEXER_PORT   = "";

export const algodClient   = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
const algodBackup           = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER_BACKUP, ALGOD_PORT);
export const indexerClient = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_SERVER, INDEXER_PORT);

// Wrapper: try primary algod, fall back to backup on rate-limit / network errors
async function getSuggestedParams() {
  try {
    const sp = await algodClient.getTransactionParams().do();
    return sp;
  } catch (e) {
    console.warn("Primary algod failed, trying backup:", e.message);
    return await algodBackup.getTransactionParams().do();
  }
}

// Execute an ATC, retrying once on the backup client if primary fails
async function executeAtc(atc) {
  try {
    return await atc.execute(algodClient, 4);
  } catch (e) {
    console.warn("Primary algod ATC failed, retrying on backup:", e.message);
    return await atc.execute(algodBackup, 4);
  }
}

export const EXPLORER_BASE = "https://testnet.explorer.perawallet.app";

// ── Micro-ALGO helpers ────────────────────────────────────────────────────────
export const toAlgo  = (micro) => (micro / 1_000_000).toFixed(4);
export const toMicro = (algo)  => Math.floor(Number(algo) * 1_000_000);

// ── LocalStorage will tracker ─────────────────────────────────────────────────
const LS_KEY = "algolegacy_wills"; // { [walletAddr]: number[] }

export function getStoredWillIds(walletAddr) {
  if (!walletAddr) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const ids = stored[walletAddr] || [];
    // Also include legacy APP_ID if set and not already listed
    if (APP_ID > 0 && !ids.includes(APP_ID)) ids.unshift(APP_ID);
    return ids;
  } catch {
    return APP_ID > 0 ? [APP_ID] : [];
  }
}

export function addStoredWillId(walletAddr, appId) {
  if (!walletAddr || !appId) return;
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const ids = stored[walletAddr] || [];
    if (!ids.includes(appId)) ids.push(appId);
    stored[walletAddr] = ids;
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
  } catch {}
}

export function removeStoredWillId(walletAddr, appId) {
  if (!walletAddr || !appId) return;
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    stored[walletAddr] = (stored[walletAddr] || []).filter((id) => id !== appId);
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
  } catch {}
}

// ── Indexer: discover ALL wills where walletAddr is a beneficiary ─────────────
// Searches indexer for every app-call transaction that involved this address
// (e.g. when the owner called set_beneficiary with this addr in accounts[]).
// Then verifies on-chain that the address actually has an allocation.
export async function discoverBeneficiaryWills(walletAddr) {
  if (!walletAddr) return [];
  const discovered = new Set();
  try {
    let nextToken = undefined;
    // Page through all app-call transactions involving this address
    do {
      let query = indexerClient
        .searchForTransactions()
        .address(walletAddr)
        .txType("appl")
        .limit(200);
      if (nextToken) query = query.nextToken(nextToken);
      const resp = await query.do();
      for (const txn of resp.transactions || []) {
        const appId = txn["application-transaction"]?.["application-id"] ?? txn["created-application-index"];
        if (appId && appId > 0) discovered.add(Number(appId));
      }
      nextToken = resp["next-token"];
    } while (nextToken && discovered.size < 500);
  } catch (e) {
    console.warn("discoverBeneficiaryWills indexer error:", e.message);
  }

  // Filter: keep only apps where this address actually has an allocation
  const confirmed = [];
  await Promise.all(
    Array.from(discovered).map(async (appId) => {
      try {
        const s = await getAppGlobalState(appId);
        if (!s || !Number(s.will_created)) return;
        const isBeneficiary = [1, 2, 3].some(
          (slot) =>
            (s[`beneficiary${slot}_address`] ?? "") === walletAddr &&
            (Number(s[`beneficiary${slot}_percent`] ?? 0) > 0 ||
             Number(s[`b${slot}_asa_amount`] ?? 0) > 0)
        );
        if (isBeneficiary) confirmed.push(appId);
      } catch {}
    })
  );
  return confirmed;
}

async function compileProgramFromTeal(tealSource) {
  const primary = async () => {
    const resp = await algodClient.compile(tealSource).do();
    return Uint8Array.from(atob(resp.result), (c) => c.charCodeAt(0));
  };
  const backup = async () => {
    const resp = await algodBackup.compile(tealSource).do();
    return Uint8Array.from(atob(resp.result), (c) => c.charCodeAt(0));
  };
  try {
    return await primary();
  } catch (e) {
    console.warn("Primary compile failed, trying backup:", e.message);
    return await backup();
  }
}

// ── Deploy a new will app instance ───────────────────────────────────────────
export async function deployWillApp(sender, signer) {
  // Compile currently deployed TEAL sources to avoid stale/corrupted bytecode blobs
  const [approvalTeal, clearTeal] = await Promise.all([
    fetch("/AlgoLegacy.approval.teal").then((r) => {
      if (!r.ok) throw new Error("Failed to load approval TEAL");
      return r.text();
    }),
    fetch("/AlgoLegacy.clear.teal").then((r) => {
      if (!r.ok) throw new Error("Failed to load clear TEAL");
      return r.text();
    }),
  ]);

  const [approvalProgram, clearProgram] = await Promise.all([
    compileProgramFromTeal(approvalTeal),
    compileProgramFromTeal(clearTeal),
  ]);

  // Build create transaction
  // Schema: 4 byte-slices (owner, b1/b2/b3 addr)
  //         11 ints      (inactivity_period, last_checkin, inheritance_active,
  //                       total_locked, will_created, b1/b2/b3 percent+claimed)
  const sp = await getSuggestedParams();

  // Extra pages needed if approval > 2048 bytes (each page = 2048 bytes)
  const extraPages = Math.max(0, Math.ceil(approvalProgram.length / 2048) - 1);

  const createTxn = algosdk.makeApplicationCreateTxnFromObject({
    from:             sender,
    suggestedParams:  { ...sp, fee: 1000, flatFee: true },
    onComplete:       algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram,
    clearProgram,
    numGlobalByteSlices: 4,
    numGlobalInts:       18,  // 11 original + 7 ASA (locked_asa_id, b1/b2/b3 asa_amount + asa_claimed)
    numLocalByteSlices:  0,
    numLocalInts:        0,
    extraPages,
  });

  // Sign + submit via fallback-safe helper
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addTransaction({ txn: createTxn, signer });
  const result = await executeAtc(atc);

  // Extract app ID — try confirmed-txn info, fall back to indexer
  const txId = result.txIDs[0];
  let appId;
  try {
    const info = await algodClient.pendingTransactionInformation(txId).do();
    appId = info["application-index"];
  } catch {
    // algod unavailable — poll indexer
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const idxInfo = await indexerClient.searchForTransactions().txid(txId).do();
        appId = idxInfo?.transactions?.[0]?.["created-application-index"];
        if (appId) break;
      } catch { /* retry */ }
    }
  }
  if (!appId) throw new Error("App creation failed — could not determine application-index");
  return Number(appId);
}

// ── ABI Method helpers ────────────────────────────────────────────────────────

// Outer transaction fee per method:
//   claim    → 2000 (base + 1 inner txn for beneficiary)
//   others   → 1000
const METHOD_FEES = {
  claim:      2000,
  deposit:    1000,
  opt_in_asa: 2000,   // inner opt-in txn
  lock_asa:   1000,   // no inner txn (just state update)
  claim_asa:  2000,   // inner ASA transfer txn
  revoke_will: 2000,  // may contain inner ALGO payment
};

/**
 * Encode an ABI method call and send it.
 * Returns { txId, returnValue }
 *
 * payment       — microALGO pay txn bundled as the first group txn (for "pay" args)
 * assetTransfer — { assetId, amount } for ASA transfer args (for "axfer" args)
 * foreignAssets — extra asset IDs to include in the foreign-assets array
 * accounts      — extra accounts
 */
export async function callMethod({ sender, signer, methodName, methodArgs, appId, payment, assetTransfer, foreignAssets, accounts }) {
  const sp     = await getSuggestedParams();
  const appRef = algosdk.getApplicationAddress(appId);
  const fee    = METHOD_FEES[methodName] ?? 2000;

  const method  = algosdk.ABIMethod.fromSignature(ABI_SIGNATURES[methodName]);
  const atc     = new algosdk.AtomicTransactionComposer();

  const txnArgs = {
    appID:            appId,
    sender,
    suggestedParams:  { ...sp, fee, flatFee: true },
    ...(foreignAssets ? { appForeignAssets: foreignAssets } : {}),
    ...(accounts      ? { appAccounts:      accounts }      : {}),
  };

  if (payment) {
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from:            sender,
      to:              appRef,
      amount:          payment,
      suggestedParams: { ...sp, fee: 1000, flatFee: true },
    });
    atc.addMethodCall({
      ...txnArgs,
      method,
      methodArgs: [...methodArgs, { txn: payTxn, signer }],
      signer,
    });
  } else if (assetTransfer) {
    const axferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from:            sender,
      to:              appRef,
      assetIndex:      assetTransfer.assetId,
      amount:          assetTransfer.amount,
      suggestedParams: { ...sp, fee: 1000, flatFee: true },
    });
    atc.addMethodCall({
      ...txnArgs,
      method,
      // axfer is index 0 in the ABI signature — must be prepended, not appended
      methodArgs: [{ txn: axferTxn, signer }, ...methodArgs],
      signer,
    });
  } else {
    atc.addMethodCall({ ...txnArgs, method, methodArgs, signer });
  }

  const result = await executeAtc(atc);
  return {
    txId:        result.txIDs[0],
    returnValue: result.methodResults[0]?.returnValue,
  };
}

// ── ABI Method signatures ─────────────────────────────────────────────────────
// Keep in sync with algolegacy.py.
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
  // Digital asset (ASA) methods
  opt_in_asa:            "opt_in_asa(asset)string",
  lock_asa:              "lock_asa(axfer,uint64,uint64,uint64)string",
  claim_asa:             "claim_asa(uint64)uint64",
};

// ── Read contract state ───────────────────────────────────────────────────────
export async function getAppGlobalState(appId) {
  if (!appId) return null;
  try {
    let raw;
    try {
      const info = await algodClient.getApplicationByID(appId).do();
      raw = info.params["global-state"] || [];
    } catch {
      // algod unavailable — fall back to indexer
      const idxInfo = await indexerClient.lookupApplications(appId).do();
      raw = idxInfo?.application?.params?.["global-state"] || [];
    }
    const state = {};
    raw.forEach(({ key, value }) => {
      const k = atob(key);
      if (value.type === 1) {
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
      // Digital assets (ASA)
      locked_asa_id:         state["locked_asa_id"]      ?? 0,
      b1_asa_amount:         state["b1_asa_amount"]      ?? 0,
      b1_asa_claimed:        state["b1_asa_claimed"]     ?? 0,
      b2_asa_amount:         state["b2_asa_amount"]      ?? 0,
      b2_asa_claimed:        state["b2_asa_claimed"]     ?? 0,
      b3_asa_amount:         state["b3_asa_amount"]      ?? 0,
      b3_asa_claimed:        state["b3_asa_claimed"]     ?? 0,
    };

    const nowSec   = Math.floor(Date.now() / 1000);
    const deadline = Number(s.last_checkin) + Number(s.inactivity_period);
    s.time_remaining = Math.max(0, deadline - nowSec);

    return s;
  } catch (err) {
    console.error("getAppGlobalState error", err);
    return null;
  }
}

// ── Beneficiary self opt-in to an ASA ────────────────────────────────────────
// Beneficiaries must opt in to the ASA from their own wallet before they can
// receive a token transfer from the contract.
export async function optInToAsa(sender, signer, assetId) {
  const sp  = await getSuggestedParams();
  const atc = new algosdk.AtomicTransactionComposer();
  const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from:            sender,
    to:              sender,          // self-transfer = opt-in
    assetIndex:      assetId,
    amount:          0,
    suggestedParams: { ...sp, fee: 1000, flatFee: true },
  });
  atc.addTransaction({ txn: optInTxn, signer });
  const result = await executeAtc(atc);
  return { txId: result.txIDs[0] };
}

// ── Check whether an account is opted in to an ASA ───────────────────────────
export async function isOptedInToAsa(address, assetId) {
  if (!address || !assetId) return false;
  try {
    const info = await algodClient.accountInformation(address).do();
    const assets = info.assets ?? info["assets"] ?? [];
    return assets.some((a) => (a["asset-id"] ?? a.assetId) === Number(assetId));
  } catch {
    return false;
  }
}

// ── Direct ASA transfer (sender → any receiver) ───────────────────────────────
// Receiver must already be opted in to the ASA.
export async function sendAsa(sender, signer, receiver, assetId, amount) {
  const sp  = await getSuggestedParams();
  const atc = new algosdk.AtomicTransactionComposer();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from:            sender,
    to:              receiver,
    assetIndex:      Number(assetId),
    amount:          Number(amount),
    suggestedParams: { ...sp, fee: 1000, flatFee: true },
  });
  atc.addTransaction({ txn, signer });
  const result = await executeAtc(atc);
  return { txId: result.txIDs[0] };
}

// ── Fetch ASA metadata (name, unitName, decimals, total, url) ────────────────
export async function getAssetInfo(assetId) {
  const info = await algodClient.getAssetByID(Number(assetId)).do();
  const p = info.params;
  return {
    assetId:   Number(assetId),
    name:      p.name        ?? `ASA #${assetId}`,
    unitName:  p["unit-name"] ?? "",
    decimals:  p.decimals    ?? 0,
    total:     p.total       ?? 0,
    url:       p.url         ?? "",
    manager:   p.manager     ?? "",
    creator:   p.creator     ?? "",
  };
}

// ── Mint a new NFT (ASA total=1, decimals=0, ARC-3 IPFS metadata URL) ─────────
// metadataUrl should be "ipfs://<CID>#arc3"
export async function mintNft(sender, signer, { name, unitName, metadataUrl }) {
  const sp  = await getSuggestedParams();
  const atc = new algosdk.AtomicTransactionComposer();

  // ARC-3: URL field stores the IPFS metadata URL (max 96 chars); use #arc3 suffix
  const url = metadataUrl.length > 96 ? metadataUrl.slice(0, 96) : metadataUrl;

  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from:           sender,
    suggestedParams: { ...sp, fee: 1000, flatFee: true },
    defaultFrozen:  false,
    unitName:       unitName.slice(0, 8),
    assetName:      name.slice(0, 32),
    total:          1,
    decimals:       0,
    url,
    manager:        sender,
    reserve:        sender,
    freeze:         sender,
    clawback:       sender,
  });

  atc.addTransaction({ txn, signer });
  const result = await executeAtc(atc);
  const txId   = result.txIDs[0];

  // Retrieve the created asset ID from the confirmed transaction
  const confirmed = await algodClient.pendingTransactionInformation(txId).do();
  const assetId   = confirmed["asset-index"];

  return { txId, assetId };
}

// ── Simulated read-only call ──────────────────────────────────────────────────
export async function readMethod(sender, methodName, appId, args = []) {
  const sp     = await algodClient.getTransactionParams().do();
  const method = algosdk.ABIMethod.fromSignature(ABI_SIGNATURES[methodName]);
  const atc    = new algosdk.AtomicTransactionComposer();

  const fakeSigner = algosdk.makeBasicAccountTransactionSigner(
    algosdk.mnemonicToSecretKey("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon invest")
  );

  atc.addMethodCall({
    appID:           appId,
    sender,
    suggestedParams: { ...sp, fee: 1000, flatFee: true },
    method,
    methodArgs:      args,
    signer:          fakeSigner,
  });

  const simResult = await atc.simulate(algodClient);
  return simResult.methodResults[0]?.returnValue;
}
