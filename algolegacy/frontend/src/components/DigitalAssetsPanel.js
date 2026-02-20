// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DigitalAssetsPanel.js â€” Three independent tabs
//
//  Tab 1 â€” Will Tokens   lock any ASA into a will for beneficiaries
//  Tab 2 â€” Send Tokens   standalone direct ASA transfer, no will needed
//  Tab 3 â€” NFT Will      mint NFT with IPFS metadata, then lock in will
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "./WalletContext";
import {
  callMethod,
  algodClient,
  EXPLORER_BASE,
  optInToAsa,
  isOptedInToAsa,
  sendAsa,
  mintNft,
  getAppGlobalState,
} from "../algorand";
import {
  uploadFileToIPFS,
  uploadMetadataToIPFS,
  buildArc3Metadata,
  ipfsToHttp,
  isPinataConfigured,
} from "../utils/ipfs";
import { toast } from "react-toastify";
import { parseError, parseActionError } from "../utils/errorMessages";

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const toDisplay = (units, decimals) =>
  decimals === 0
    ? String(units)
    : (Number(units) / 10 ** decimals).toFixed(decimals);

const short = (addr) =>
  addr ? `${addr.slice(0, 6)}\u2026${addr.slice(-4)}` : "\u2014";

const TxLink = ({ txId, label = "View Tx \u2197" }) => (
  <a
    href={`${EXPLORER_BASE}/tx/${txId}`}
    target="_blank"
    rel="noreferrer"
    style={{ color: "var(--accent)" }}
  >
    {label}
  </a>
);

const TABS = [
  { id: "will", label: "Will Tokens" },
  { id: "send", label: "Send Tokens" },
  { id: "nft",  label: "NFT Will" },
];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function DigitalAssetsPanel({ state, appId, onRefresh }) {
  const { activeAddr, makeSigner } = useWallet();
  const [tab, setTab] = useState("will");

  return (
    <div>
      <div className="card" style={{ textAlign: "center", paddingTop: 32, paddingBottom: 24 }}>
        <p style={{ fontSize: 36, marginBottom: 8 }}></p>
        <h2 style={{ marginBottom: 6 }}>Digital Assets</h2>
        <p className="text-muted" style={{ maxWidth: 560, margin: "0 auto", fontSize: 14 }}>
          Manage tokenised assets independently or as part of a will.
          Lock ASA tokens for beneficiaries, send tokens directly, or include
          IPFS-backed NFTs in your digital inheritance.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 6 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text-muted)", transition: "all .18s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "will" && <WillTokensTab state={state} appId={appId} onRefresh={onRefresh} activeAddr={activeAddr} makeSigner={makeSigner} />}
      {tab === "send" && <SendTokensTab activeAddr={activeAddr} makeSigner={makeSigner} />}
      {tab === "nft"  && <NftWillTab  state={state} appId={appId} onRefresh={onRefresh} activeAddr={activeAddr} makeSigner={makeSigner} />}
    </div>
  );
}

// Sub-components: WillTokensTab, SendTokensTab, NftWillTab are defined below.

// â•â•â• TAB 1
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function WillTokensTab({ state, appId, onRefresh, activeAddr, makeSigner }) {
  const [loading, setLoading]           = useState(null);
  const [optAsaId, setOptAsaId]         = useState("");
  const [asaInfo,  setAsaInfo]          = useState(null);
  const [asaFetching, setAsaFetching]   = useState(false);
  const [amounts, setAmounts]           = useState({ b1: "", b2: "", b3: "" });
  const [myOptedIn, setMyOptedIn]       = useState(false);
  const [optInLoading, setOptInLoading] = useState(false);

  const lockedId = Number(state?.locked_asa_id ?? 0);

  const fetchInfo = async (id) => {
    if (!id || isNaN(Number(id)) || Number(id) <= 0) { setAsaInfo(null); return; }
    setAsaFetching(true);
    try {
      const info = await algodClient.getAssetByID(Number(id)).do();
      const p = info.params;
      setAsaInfo({ name: p.name ?? `ASA #${id}`, unitName: p["unit-name"] ?? "", decimals: p.decimals ?? 0, total: p.total ?? 0 });
    } catch { setAsaInfo({ name: `Unknown ASA #${id}`, unitName: "", decimals: 0, total: 0 }); }
    finally { setAsaFetching(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (lockedId > 0) fetchInfo(lockedId); }, [lockedId]);
  useEffect(() => {
    if (!activeAddr || lockedId <= 0) { setMyOptedIn(false); return; }
    isOptedInToAsa(activeAddr, lockedId).then(setMyOptedIn).catch(() => setMyOptedIn(false));
  }, [activeAddr, lockedId]);

  if (!state || !Number(state.will_created)) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}></p>
        <h3 style={{ marginBottom: 8 }}>No Will Found</h3>
        <p className="text-muted">Create a will first to lock tokens for beneficiaries.</p>
      </div>
    );
  }

  const isOwner  = activeAddr && state.owner === activeAddr;
  const isActive = Number(state.inheritance_active) === 1;
  const beneficiaries = [1, 2, 3].map((slot) => ({
    slot,
    address:    state[`beneficiary${slot}_address`] ?? "",
    asaAmount:  Number(state[`b${slot}_asa_amount`]  ?? 0),
    asaClaimed: Number(state[`b${slot}_asa_claimed`] ?? 0) === 1,
  }));

  // Find the connected wallet's slot (if any)
  const mySlot = beneficiaries.find((b) => activeAddr && b.address === activeAddr && b.asaAmount > 0);

  const doCall = async (label, opts) => {
    if (!activeAddr) return toast.error("Connect wallet first");
    setLoading(label);
    try {
      const result = await callMethod({ sender: activeAddr, signer: makeSigner(), appId, ...opts });
      toast.success(<span>{label}! <TxLink txId={result.txId} /></span>);
      onRefresh?.();
    } catch (err) { toast.error(parseActionError(err, label), { autoClose: 8000 }); }
    finally { setLoading(null); }
  };

  // â”€â”€ BENEFICIARY VIEW (non-owner with an allocation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!isOwner && mySlot) {
    const units = asaInfo
      ? `${toDisplay(mySlot.asaAmount, asaInfo.decimals)} ${asaInfo.unitName || "units"}`
      : `${mySlot.asaAmount} units`;

    return (
      <div>
        {/* Personal allocation card */}
        <div className="card" style={{ border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ marginBottom: 4 }}>Your Token Inheritance</h2>
              <p className="text-muted" style={{ fontSize: 13 }}>Slot #{mySlot.slot} Â· Will #{appId}</p>
            </div>
            {mySlot.asaClaimed
              ? <span className="status-badge status-active">âœ“ Claimed</span>
              : isActive
                ? <span className="status-badge status-alive" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Active â€” Claim Now</span>
                : <span className="status-badge" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>Pending Activation</span>}
          </div>

          {/* ASA info row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: "var(--card-bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>ASA ID</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {lockedId > 0
                  ? <a href={`${EXPLORER_BASE}/asset/${lockedId}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>#{lockedId} â†—</a>
                  : <span className="text-muted">Not locked yet</span>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: "var(--card-bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Token</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{asaInfo ? `${asaInfo.name} (${asaInfo.unitName || "â€”"})` : lockedId > 0 ? "Loadingâ€¦" : "â€”"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: "var(--card-bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Your Allocation</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#10b981" }}>{units}</div>
            </div>
          </div>

          {/* Action flow â€” always visible once lockedId is set */}
          {lockedId <= 0 && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(100,116,139,0.1)", border: "1px solid var(--border)", fontSize: 13 }}>
              The owner has not yet locked the ASA into this will. Check back later.
            </div>
          )}

          {lockedId > 0 && !mySlot.asaClaimed && (
            <>
              {/* STEP 1: Opt in â€” show even before inheritance is active */}
              {!myOptedIn && (
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", marginBottom: 12 }}>
                  <p style={{ fontSize: 13, marginBottom: 10, color: "#f59e0b" }}>
                    <strong>Action required:</strong> You must opt your wallet into ASA #{lockedId} before you can receive it.
                  </p>
                  <button className="btn btn-primary" disabled={optInLoading}
                    onClick={async () => {
                      setOptInLoading(true);
                      try {
                        const fresh = await getAppGlobalState(appId);
                        const freshId = Number(fresh?.locked_asa_id ?? lockedId);
                        if (!freshId) return toast.error("No ASA locked in this will");
                        const r = await optInToAsa(activeAddr, makeSigner(), freshId);
                        setMyOptedIn(true);
                        toast.success(<span>Opted in to ASA #{freshId}! <TxLink txId={r.txId} /></span>);
                      } catch (e) { toast.error(parseActionError(e, "Opt-in"), { autoClose: 8000 }); }
                      finally { setOptInLoading(false); }
                    }}>
                    {optInLoading ? <><span className="spinner" /> Opting Inâ€¦</> : `Opt In to ASA #${lockedId}`}
                  </button>
                </div>
              )}

              {/* STEP 2: Claim â€” shown immediately after opt-in when active */}
              {myOptedIn && isActive && (
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.4)" }}>
                  <p style={{ fontSize: 13, marginBottom: 10, color: "#10b981" }}>
                    <strong>Opted in!</strong> You can now claim your {units}.
                  </p>
                  <button className="btn btn-success" disabled={!!loading}
                    onClick={async () => {
                      const fresh = await getAppGlobalState(appId);
                      const freshId = Number(fresh?.locked_asa_id ?? 0);
                      if (!freshId) return toast.error("No ASA locked â€” please refresh");
                      doCall(`Claim ASA (slot ${mySlot.slot})`, {
                        methodName:    "claim_asa",
                        methodArgs:    [BigInt(mySlot.slot)],
                        foreignAssets: [freshId],
                        accounts:      [mySlot.address],
                      });
                    }}>
                    {loading === `Claim ASA (slot ${mySlot.slot})` ? <><span className="spinner" /> Claimingâ€¦</> : `Claim ${units}`}
                  </button>
                </div>
              )}

              {/* Opted in but waiting for activation */}
              {myOptedIn && !isActive && (
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    <strong>Opted in to ASA #{lockedId}.</strong> Your {units} will be claimable once the owner's inactivity period expires and inheritance activates.
                  </p>
                </div>
              )}
            </>
          )}

          {mySlot.asaClaimed && (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", fontSize: 13 }}>
              You have already claimed your {units}.
            </div>
          )}
        </div>
      </div>
    );
  }

  // â”€â”€ RANDOM WALLET (not owner, no allocation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!isOwner && !mySlot) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "36px 24px" }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}></p>
        <h3 style={{ marginBottom: 8 }}>No Token Allocation Found</h3>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Your connected wallet ({activeAddr ? `${activeAddr.slice(0,6)}â€¦${activeAddr.slice(-4)}` : "none"}) is not assigned a token allocation in this will.
        </p>
      </div>
    );
  }

  // â”€â”€ OWNER MANAGEMENT VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div>
      {/* Locked ASA summary */}
      <div className="card">
        <h2>Locked ASA</h2>
        {lockedId > 0 ? (
          <div className="stats-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="stat-label">Asset ID</div>
              <div className="stat-value green">
                <a href={`${EXPLORER_BASE}/asset/${lockedId}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>#{lockedId} â†—</a>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Name</div>
              <div className="stat-value purple">{asaInfo ? `${asaInfo.name} (${asaInfo.unitName || "â€”"})` : "â€¦"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Locked</div>
              <div className="stat-value green">
                {asaInfo
                  ? `${toDisplay(beneficiaries.reduce((s, b) => s + b.asaAmount, 0), asaInfo.decimals)} ${asaInfo.unitName || "units"}`
                  : `${beneficiaries.reduce((s, b) => s + b.asaAmount, 0)} units`}
              </div>
            </div>
          </div>
        ) : <p className="text-muted">No ASA locked yet. Complete Step 1 and Step 2 below.</p>}
      </div>

      {/* Allocations table â€” owner sees all slots */}
      {lockedId > 0 && (
        <div className="card">
          <h2>Beneficiary Allocations</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left",  padding: "8px 0" }}>Slot</th>
              <th style={{ textAlign: "left",  padding: "8px 0" }}>Address</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>Allocated</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>Status</th>
            </tr></thead>
            <tbody>
              {beneficiaries.map((b) => {
                const units = asaInfo
                  ? `${toDisplay(b.asaAmount, asaInfo.decimals)} ${asaInfo.unitName || "units"}`
                  : `${b.asaAmount} units`;
                return (
                  <tr key={b.slot} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 0", fontWeight: 600 }}>#{b.slot}</td>
                    <td style={{ padding: "10px 0", color: "var(--text-muted)", fontSize: 12 }}>
                      {b.address ? short(b.address) : <span className="text-muted">â€” empty â€”</span>}
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>
                      {b.asaAmount > 0 ? units : <span className="text-muted">â€”</span>}
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>
                      {b.asaClaimed
                        ? <span className="status-badge status-active">âœ“ Claimed</span>
                        : b.asaAmount > 0
                          ? <span className="status-badge status-alive">Pending</span>
                          : <span className="text-muted" style={{ fontSize: 12 }}>None</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isActive && <p className="text-muted" style={{ marginTop: 10, fontSize: 13 }}>Inheritance active â€” beneficiaries can claim in their Claim tab.</p>}
        </div>
      )}

      {/* Owner step controls â€” only when not yet active */}
      {!isActive && (
        <>
          <div className="card">
            <h2>Step 1 â€” Opt Contract Into ASA</h2>
            <p className="text-muted" style={{ marginBottom: 14, fontSize: 13 }}>Contract must opt in before it can hold tokens. Do this once per asset.</p>
            <div className="flex-row" style={{ alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>ASA / Token ID</label>
                <input type="number" min={1} value={optAsaId} placeholder="e.g. 755790563"
                  onChange={(e) => { setOptAsaId(e.target.value); setAsaInfo(null); }}
                  onBlur={() => fetchInfo(optAsaId)} />
                {asaFetching && <p className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>Fetchingâ€¦</p>}
                {asaInfo && !asaFetching && <p style={{ marginTop: 6, fontSize: 12, color: "var(--accent)" }}>âœ” {asaInfo.name} ({asaInfo.unitName}) â€” decimals: {asaInfo.decimals}</p>}
              </div>
              <button className="btn btn-primary" disabled={!!loading || lockedId > 0}
                title={lockedId > 0 ? "Already opted in" : ""}
                onClick={() => {
                  const id = Number(optAsaId);
                  if (!id || id <= 0) return toast.error("Enter valid ASA ID");
                  doCall("Opt-In ASA", { methodName: "opt_in_asa", methodArgs: [BigInt(id)], foreignAssets: [id] });
                }}>
                {loading === "Opt-In ASA" ? <><span className="spinner" /> Opting Inâ€¦</> : lockedId > 0 ? `Opted In (#${lockedId})` : "Opt In"}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Step 2 â€” Lock Token Allocations</h2>
            <p className="text-muted" style={{ marginBottom: 14, fontSize: 13 }}>
              Allocate amounts per beneficiary. Tokens transfer from your wallet to the contract.
              {asaInfo && <span> Token: <strong>{asaInfo.name}</strong> ({asaInfo.unitName}){asaInfo.decimals > 0 && ` â€” base units (Ã—10^${asaInfo.decimals})`}.</span>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              {[1, 2, 3].map((slot) => {
                const addr = state[`beneficiary${slot}_address`] ?? "";
                return (
                  <div className="form-group" key={slot} style={{ marginBottom: 0 }}>
                    <label>Slot {slot} {addr ? `(${addr.slice(0, 6)}â€¦)` : "(empty)"}</label>
                    <input type="number" min={0} value={amounts[`b${slot}`]} placeholder="units"
                      onChange={(e) => setAmounts((p) => ({ ...p, [`b${slot}`]: e.target.value }))} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="text-muted" style={{ flex: 1, fontSize: 13 }}>
                Total: <strong>{Number(amounts.b1 || 0) + Number(amounts.b2 || 0) + Number(amounts.b3 || 0)} {asaInfo?.unitName || "units"}</strong>
              </span>
              <button className="btn btn-success" disabled={!!loading || lockedId <= 0}
                title={lockedId <= 0 ? "Complete Step 1 first" : ""}
                onClick={() => {
                  const b1 = BigInt(amounts.b1 || 0), b2 = BigInt(amounts.b2 || 0), b3 = BigInt(amounts.b3 || 0);
                  const total = Number(b1 + b2 + b3);
                  if (total <= 0) return toast.error("Enter at least one non-zero amount");
                  doCall("Lock ASA", { methodName: "lock_asa", methodArgs: [b1, b2, b3], assetTransfer: { assetId: lockedId, amount: total }, foreignAssets: [lockedId] });
                }}>
                {loading === "Lock ASA" ? <><span className="spinner" /> Lockingâ€¦</> : "Lock Tokens"}
              </button>
            </div>
            {lockedId <= 0 && <p className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>âš  Complete Step 1 first.</p>}
          </div>
        </>
      )}
      {isActive && (
        <div className="alert alert-danger" style={{ marginTop: 20 }}>
          <strong>Inheritance is ACTIVE.</strong> Beneficiaries can claim in their Claim tab.
        </div>
      )}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 2 â€” Send Tokens (standalone)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function SendTokensTab({ activeAddr, makeSigner }) {
  const [assetId,   setAssetId]   = useState("");
  const [receiver,  setReceiver]  = useState("");
  const [amount,    setAmount]    = useState("");
  const [asaInfo,   setAsaInfo]   = useState(null);
  const [fetching,  setFetching]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [myBalance, setMyBalance] = useState(null);

  const fetchInfo = async (id) => {
    const n = Number(id);
    if (!n || n <= 0) { setAsaInfo(null); setMyBalance(null); return; }
    setFetching(true);
    try {
      const info = await algodClient.getAssetByID(n).do();
      const p = info.params;
      setAsaInfo({ name: p.name ?? `ASA #${n}`, unitName: p["unit-name"] ?? "", decimals: p.decimals ?? 0 });
      if (activeAddr) {
        try {
          const acct = await algodClient.accountAssetInformation(activeAddr, n).do();
          setMyBalance(acct["asset-holding"]?.amount ?? 0);
        } catch { setMyBalance(null); }
      }
    } catch { setAsaInfo(null); setMyBalance(null); }
    finally { setFetching(false); }
  };

  const handleSend = async () => {
    if (!activeAddr) return toast.error("Connect wallet first");
    const id = Number(assetId);
    const amt = Number(amount);
    if (!id || id <= 0) return toast.error("Enter a valid ASA ID");
    if (!receiver || receiver.length !== 58) return toast.error("Enter a valid 58-char Algorand address");
    if (!amt || amt <= 0) return toast.error("Enter a positive amount");
    const receiverOptedIn = await isOptedInToAsa(receiver, id);
    if (!receiverOptedIn) {
      return toast.error(
        `Receiver has not opted in to ASA #${id}. They need to add the token in Pera Wallet first.`,
        { autoClose: 8000 }
      );
    }
    setLoading(true);
    try {
      const result = await sendAsa(activeAddr, makeSigner(), receiver, id, amt);
      toast.success(<span>\u2705 Sent {amt} {asaInfo?.unitName||"units"} to {short(receiver)}! <TxLink txId={result.txId} /></span>);
      setAmount("");
      fetchInfo(assetId);
    } catch (err) { toast.error(parseError(err), { autoClose: 8000 }); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="card">
        <h2>Send Tokens Directly</h2>
        <p className="text-muted" style={{ marginBottom:20, fontSize:13 }}>
          Transfer any ASA to any wallet \u2014 no will required. Receiver must be opted into the token.
        </p>

        <div className="form-group">
          <label>ASA / Token ID</label>
          <input type="number" min={1} value={assetId} placeholder="e.g. 755790563"
            onChange={(e) => { setAssetId(e.target.value); setAsaInfo(null); setMyBalance(null); }}
            onBlur={() => fetchInfo(assetId)} />
          {fetching && <p className="text-muted" style={{ marginTop:6, fontSize:12 }}>Fetching asset info\u2026</p>}
          {asaInfo && !fetching && (
            <div style={{ marginTop:8, display:"flex", gap:20, flexWrap:"wrap" }}>
              <span style={{ fontSize:12, color:"var(--accent)" }}>\u2714 {asaInfo.name} ({asaInfo.unitName})</span>
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>Your balance:{" "}
                {myBalance === null
                  ? <span style={{ color:"#ef4444" }}>Not opted in</span>
                  : <strong>{toDisplay(myBalance, asaInfo.decimals)} {asaInfo.unitName||"units"}</strong>}
              </span>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Receiver Address</label>
          <input type="text" value={receiver} placeholder="LAVEX\u2026HHKEQ"
            style={{ fontFamily:"monospace", fontSize:13 }}
            onChange={(e) => setReceiver(e.target.value.trim())} />
          {receiver.length > 0 && receiver.length !== 58 && (
            <p style={{ marginTop:4, fontSize:12, color:"#ef4444" }}>\u26a0 Algorand addresses are 58 characters</p>
          )}
        </div>

        <div className="form-group">
          <label>Amount {asaInfo && asaInfo.decimals > 0 && <span className="text-muted" style={{ fontSize:12 }}>(base units, \xf710^{asaInfo.decimals})</span>}</label>
          <input type="number" min={1} value={amount} placeholder="e.g. 1000" onChange={(e) => setAmount(e.target.value)} />
        </div>

        <div style={{ padding:"12px 14px", background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:10, fontSize:13, marginBottom:16 }}>
          \u2139\ufe0f <strong>Note:</strong> The receiver must be opted in to this token.
          If using Pera Wallet: <em>Assets \u2192 + Add Token \u2192 search asset ID</em>.
        </div>

        <button className="btn btn-primary" style={{ width:"100%" }}
          disabled={loading || !assetId || !receiver || !amount}
          onClick={handleSend}>
          {loading ? <><span className="spinner" /> Sending\u2026</> : "Send Tokens"}
        </button>
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 3 â€” NFT Will (IPFS + Algorand ARC-3)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function NftWillTab({ state, appId, onRefresh, activeAddr, makeSigner }) {
  const [nftName,      setNftName]      = useState("");
  const [nftUnit,      setNftUnit]      = useState("");
  const [nftDesc,      setNftDesc]      = useState("");
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mintStep,     setMintStep]     = useState("idle");
  const [mintedId,     setMintedId]     = useState(null);
  const [mintedTxId,   setMintedTxId]   = useState(null);
  const [ipfsMeta,     setIpfsMeta]     = useState(null);
  const [lockLoading,  setLockLoading]  = useState(false);
  const [optLoading,   setOptLoading]   = useState(false);
  const fileInputRef = useRef(null);

  // â”€â”€ Existing NFT lock state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [existId,    setExistId]    = useState("");
  const [existInfo,  setExistInfo]  = useState(null);
  const [existFetch, setExistFetch] = useState(false);
  const [existOpt,   setExistOpt]   = useState(false);
  const [existLock,  setExistLock]  = useState(false);

  const pinataReady = isPinataConfigured();
  const hasWill  = state && Number(state.will_created) === 1;
  const isOwner  = activeAddr && state?.owner === activeAddr;
  const isActive = Number(state?.inheritance_active ?? 0) === 1;

  const fetchExistingNft = async (id) => {
    const n = Number(id);
    if (!n || n <= 0) { setExistInfo(null); return; }
    setExistFetch(true);
    try {
      const info = await algodClient.getAssetByID(n).do();
      const p = info.params;
      // Check caller's balance
      let myBal = 0;
      if (activeAddr) {
        try {
          const acct = await algodClient.accountAssetInformation(activeAddr, n).do();
          myBal = acct["asset-holding"]?.amount ?? 0;
        } catch { myBal = 0; }
      }
      setExistInfo({
        id: n,
        name:     p.name        ?? `ASA #${n}`,
        unitName: p["unit-name"] ?? "",
        decimals: p.decimals    ?? 0,
        total:    Number(p.total ?? 0),
        url:      p.url         ?? "",
        myBal,
      });
    } catch (e) {
      toast.error(`Could not fetch ASA #${id}. Please verify the Asset ID is correct.`);
      setExistInfo(null);
    }
    finally { setExistFetch(false); }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleMint = async () => {
    if (!activeAddr)   return toast.error("Connect wallet first");
    if (!nftName.trim()) return toast.error("Enter an NFT name");
    if (!nftUnit.trim()) return toast.error("Enter a unit name");
    if (!imageFile)    return toast.error("Select an image file");
    if (!pinataReady)  return toast.error("Configure REACT_APP_PINATA_JWT in .env first");
    try {
      setMintStep("uploading");
      toast.info("Uploading image to IPFS\u2026", { autoClose: 3000 });
      const imageCid = await uploadFileToIPFS(imageFile);
      const metadata = buildArc3Metadata({ name: nftName.trim(), description: nftDesc.trim(), imageCid, properties: { creator: activeAddr } });
      toast.info("Uploading metadata to IPFS\u2026", { autoClose: 3000 });
      const metaCid  = await uploadMetadataToIPFS(metadata);
      const metaUrl  = `ipfs://${metaCid}#arc3`;
      setIpfsMeta({ imageCid, metaCid, url: metaUrl });
      setMintStep("minting");
      toast.info("\u26CF\uFE0F Minting NFT on Algorand\u2026", { autoClose: 4000 });
      const result = await mintNft(activeAddr, makeSigner(), { name: nftName.trim(), unitName: nftUnit.trim().slice(0,8), metadataUrl: metaUrl });
      setMintedId(result.assetId);
      setMintedTxId(result.txId);
      setMintStep("done");
      toast.success(<span>NFT minted! Asset ID: <strong>{result.assetId}</strong> <TxLink txId={result.txId} /></span>, { autoClose: false });
    } catch (err) {
      console.error(err);
      toast.error(parseError(err), { autoClose: 8000 });
      setMintStep("idle");
    }
  };

  return (
    <div>
      {!pinataReady && (
        <div style={{ padding:"14px 16px", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.4)", borderRadius:12, marginBottom:20, fontSize:14 }}>
          <strong>\u26a0 Pinata not configured.</strong> To use IPFS features:
          <ol style={{ marginTop:8, marginBottom:0, paddingLeft:20, lineHeight:2 }}>
            <li>Sign up free at <a href="https://app.pinata.cloud" target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>app.pinata.cloud</a></li>
            <li>Go to <strong>API Keys \u2192 New Key</strong> \u2192 enable <em>pinFileToIPFS</em> &amp; <em>pinJSONToIPFS</em></li>
            <li>Copy the JWT (starts with <code>eyJ\u2026</code>)</li>
            <li>Add <code>REACT_APP_PINATA_JWT=eyJ\u2026</code> to <code>frontend/.env</code></li>
            <li>Restart <code>npm start</code></li>
          </ol>
        </div>
      )}

      <div className="card">
        <h2>Create NFT with IPFS Metadata</h2>
        <p className="text-muted" style={{ marginBottom:20, fontSize:13 }}>
          Image + metadata stored on IPFS (Pinata). NFT minted as ARC-3 Algorand Standard Asset with total supply = 1.
        </p>

        <div className="form-group">
          <label>NFT Image</label>
          <div style={{ border:"2px dashed var(--border)", borderRadius:12, padding:imagePreview?8:"28px 16px", textAlign:"center", cursor:"pointer", background:"var(--bg)" }}
            onClick={() => fileInputRef.current?.click()}>
            {imagePreview
              ? <img src={imagePreview} alt="preview" style={{ maxHeight:160, maxWidth:"100%", borderRadius:8, objectFit:"contain" }} />
              : <div><p style={{ fontSize:28, marginBottom:6 }}></p><p className="text-muted" style={{ fontSize:13 }}>Click to select image (PNG / JPG / SVG / GIF)</p></div>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageChange} />
          {imageFile && <p style={{ marginTop:6, fontSize:12, color:"var(--text-muted)" }}>Selected: {imageFile.name} ({(imageFile.size/1024).toFixed(1)} KB)</p>}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label>NFT Name <span className="text-muted" style={{ fontSize:12 }}>(max 32)</span></label>
            <input type="text" maxLength={32} value={nftName} onChange={(e) => setNftName(e.target.value)} placeholder="My Inheritance NFT" />
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label>Unit Name <span className="text-muted" style={{ fontSize:12 }}>(max 8)</span></label>
            <input type="text" maxLength={8} value={nftUnit} onChange={(e) => setNftUnit(e.target.value.toUpperCase())} placeholder="MYNFT" />
          </div>
        </div>

        <div className="form-group" style={{ marginTop:12 }}>
          <label>Description <span className="text-muted" style={{ fontSize:12 }}>(stored in IPFS metadata)</span></label>
          <textarea rows={3} value={nftDesc} onChange={(e) => setNftDesc(e.target.value)}
            placeholder="A rare digital asset included in my digital will\u2026"
            style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid var(--border)", background:"var(--bg)", color:"var(--text)", resize:"vertical" }} />
        </div>

        {ipfsMeta && (
          <div style={{ padding:"12px 14px", background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.3)", borderRadius:10, marginBottom:12, fontSize:12 }}>
            <p style={{ fontWeight:700, marginBottom:6, color:"#10b981" }}>\u2705 IPFS Upload Complete</p>
            <p>Image: <a href={ipfsToHttp(`ipfs://${ipfsMeta.imageCid}`)} target="_blank" rel="noreferrer" style={{ color:"var(--accent)", wordBreak:"break-all" }}>{ipfsMeta.imageCid}</a></p>
            <p>Metadata: <a href={ipfsToHttp(`ipfs://${ipfsMeta.metaCid}`)} target="_blank" rel="noreferrer" style={{ color:"var(--accent)", wordBreak:"break-all" }}>{ipfsMeta.metaCid}</a></p>
            <p style={{ color:"var(--text-muted)" }}>On-chain: <code style={{ fontSize:11 }}>{ipfsMeta.url}</code></p>
          </div>
        )}

      {mintedId && mintStep === "done" && (
          <div style={{ padding:"12px 14px", background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:10, marginBottom:12 }}>
            <p style={{ fontWeight:700, marginBottom:6 }}>NFT Minted â€” Asset ID: <strong style={{ color:"var(--accent)" }}>#{mintedId}</strong></p>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:13 }}>
              <a href={`${EXPLORER_BASE}/asset/${mintedId}`} target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>View on Explorer â†—</a>
              <TxLink txId={mintedTxId} label="View Mint Tx â†—" />
              {ipfsMeta && <a href={ipfsToHttp(`ipfs://${ipfsMeta.imageCid}`)} target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>View Image on IPFS â†—</a>}
            </div>
          </div>
        )}

        <button className="btn btn-primary" style={{ width:"100%", marginTop:4 }}
          disabled={!pinataReady || mintStep==="uploading" || mintStep==="minting" || !nftName || !nftUnit || !imageFile}
          onClick={handleMint}>
          {mintStep==="uploading" ? <><span className="spinner" /> Uploading to IPFSâ€¦</>
            : mintStep==="minting"  ? <><span className="spinner" /> Minting NFTâ€¦</>
            : mintStep==="done"     ? "Minted! (mint another?)"
            : "Upload to IPFS & Mint NFT"}
        </button>
      </div>

      {/* â”€â”€ PERSISTENT: Lock minted NFT â€” survives page reload via contract state â”€â”€ */}
      {hasWill && isOwner && !isActive && (
        (() => {
          const contractLockedId = Number(state?.locked_asa_id ?? 0);
          const alreadyAssigned  = [1,2,3].some((s) => Number(state?.[`b${s}_asa_amount`] ?? 0) > 0);
          // Show this card when:
          // a) user just minted (mintedId set, still in session) and contract NOT yet opted in
          // b) contract is opted in but amounts not yet assigned (survived page reload)
          const showOptIn  = mintedId && mintStep === "done" && contractLockedId === 0;
          const showAssign = contractLockedId > 0 && !alreadyAssigned;
          if (!showOptIn && !showAssign) return null;
          const nftId = showAssign ? contractLockedId : mintedId;
          return (
            <div className="card" style={{ border: "2px solid rgba(99,102,241,0.4)" }}>
              <h2>Lock NFT Into Will</h2>
              <p className="text-muted" style={{ marginBottom:14, fontSize:13 }}>
                {showOptIn
                  ? `Step 1: Opt the contract into NFT #${nftId}. Then Step 2: assign to a beneficiary.`
                  : `Contract is opted into NFT #${nftId}. Now assign it to a beneficiary slot.`}
              </p>

              {showOptIn && (
                <button className="btn btn-primary" style={{ marginBottom:14 }} disabled={optLoading}
                  onClick={async () => {
                    setOptLoading(true);
                    try {
                      const result = await callMethod({ sender:activeAddr, signer:makeSigner(), appId,
                        methodName:"opt_in_asa", methodArgs:[BigInt(nftId)], foreignAssets:[nftId] });
                      toast.success(<span>Contract opted into NFT #{nftId}! <TxLink txId={result.txId} /></span>);
                      onRefresh?.();
                      } catch (e) { toast.error(parseActionError(e, "Opt-in"), { autoClose: 8000 }); }
                    finally { setOptLoading(false); }
                  }}>
                  {optLoading ? <><span className="spinner" /> Opting Inâ€¦</> : `Step 1: Opt Contract Into NFT #${nftId}`}
                </button>
              )}

              {(showAssign || (showOptIn && contractLockedId > 0)) && (
                <>
                  <p className="text-muted" style={{ fontSize:13, marginBottom:10 }}>
                    {showOptIn ? "Step 2" : "Assign"} â€” Select which beneficiary slot receives this NFT (amount = 1):
                  </p>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {[1,2,3].map((slot) => {
                      const addr = state?.[`beneficiary${slot}_address`] ?? "";
                      return (
                        <button key={slot} className="btn btn-success" style={{ flex:"1 1 auto" }}
                          disabled={lockLoading || !addr} title={addr ? `Assign to ${addr}` : "No address in this slot"}
                          onClick={async () => {
                            setLockLoading(true);
                            try {
                              const fresh = await getAppGlobalState(appId);
                              const freshId = Number(fresh?.locked_asa_id ?? contractLockedId);
                              if (!freshId) return toast.error("Contract not opted in yet â€” do Step 1 first");
                              const amts = [BigInt(slot===1?1:0), BigInt(slot===2?1:0), BigInt(slot===3?1:0)];
                              const result = await callMethod({ sender:activeAddr, signer:makeSigner(), appId,
                                methodName:"lock_asa", methodArgs:amts,
                                assetTransfer:{ assetId:freshId, amount:1 }, foreignAssets:[freshId] });
                              toast.success(<span>NFT locked for slot #{slot}! <TxLink txId={result.txId} /></span>);
                              onRefresh?.();
                            } catch (e) { toast.error(parseActionError(e, "Lock NFT"), { autoClose: 8000 }); }
                            finally { setLockLoading(false); }
                          }}>
                          {lockLoading ? <><span className="spinner" /> Lockingâ€¦</> : `Slot ${slot}${addr ? ` (${addr.slice(0,6)}â€¦)` : " (empty)"}`}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()
      )}

      {/* â”€â”€ Lock an existing NFT into the will â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {hasWill && isOwner && !isActive && (
        <div className="card">
          <h2>Lock Existing NFT Into Will</h2>
          <p className="text-muted" style={{ marginBottom:16, fontSize:13 }}>
            Already own an NFT? Enter its Asset ID to lock it into your will for a beneficiary.
          </p>

          <div className="form-group">
            <label>NFT Asset ID</label>
            <div style={{ display:"flex", gap:8 }}>
              <input type="number" min={1} value={existId} placeholder="e.g. 123456789"
                onChange={(e) => { setExistId(e.target.value); setExistInfo(null); }}
                onBlur={() => fetchExistingNft(existId)}
                style={{ flex:1 }} />
              <button className="btn btn-primary" style={{ whiteSpace:"nowrap" }}
                disabled={existFetch || !existId}
                onClick={() => fetchExistingNft(existId)}>
                {existFetch ? <><span className="spinner" /> Fetchingâ€¦</> : "Lookup"}
              </button>
            </div>
          </div>

          {existInfo && (
            <>
              <div style={{ display:"flex", gap:16, alignItems:"center", padding:"12px 14px", background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.25)", borderRadius:10, marginBottom:14 }}>
                {existInfo.url && existInfo.url.startsWith("ipfs://") && (
                  <img src={ipfsToHttp(existInfo.url.replace(/#arc3$/,""))} alt="nft"
                    style={{ width:64, height:64, borderRadius:8, objectFit:"cover", flexShrink:0 }}
                    onError={(e) => { e.target.style.display="none"; }} />
                )}
                <div style={{ fontSize:13 }}>
                  <p style={{ fontWeight:700, marginBottom:2 }}>{existInfo.name} <span className="text-muted">({existInfo.unitName})</span></p>
                  <p className="text-muted">Total supply: {existInfo.total.toLocaleString()} Â· Decimals: {existInfo.decimals}</p>
                  <p style={{ marginTop:4 }}>Your balance:{" "}
                    {existInfo.myBal > 0
                      ? <strong style={{ color:"#10b981" }}>{existInfo.myBal} unit(s)</strong>
                      : <span style={{ color:"#ef4444" }}>0 â€” you don't own this NFT</span>}
                  </p>
                  {existInfo.url && <p className="text-muted" style={{ fontSize:11, wordBreak:"break-all", marginTop:4 }}>URL: {existInfo.url}</p>}
                </div>
              </div>

              {existInfo.myBal > 0 && (
                <>
                  <button className="btn btn-primary" style={{ marginBottom:12 }} disabled={existOpt}
                    onClick={async () => {
                      if (!activeAddr) return toast.error("Connect wallet first");
                      setExistOpt(true);
                      try {
                        const result = await callMethod({ sender:activeAddr, signer:makeSigner(), appId,
                          methodName:"opt_in_asa", methodArgs:[BigInt(existInfo.id)], foreignAssets:[existInfo.id] });
                        toast.success(<span>Contract opted into #{existInfo.id}! <TxLink txId={result.txId} /></span>);
                        onRefresh?.();
                      } catch (e) { toast.error(parseActionError(e, "Opt-in"), { autoClose: 8000 }); }
                      finally { setExistOpt(false); }
                    }}>
                    {existOpt ? <><span className="spinner" /> Opting Inâ€¦</> : `Step 1: Opt Contract Into #${existInfo.id}`}
                  </button>

                  <p className="text-muted" style={{ fontSize:13, marginBottom:8 }}>Step 2 â€” Assign to a beneficiary slot:</p>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {[1,2,3].map((slot) => {
                      const addr = state?.[`beneficiary${slot}_address`] ?? "";
                      return (
                        <button key={slot} className="btn btn-success" style={{ flex:"1 1 auto" }}
                          disabled={existLock || !addr}
                          title={addr ? `Lock for ${addr}` : "No beneficiary in this slot"}
                          onClick={async () => {
                            setExistLock(true);
                            try {
                              const amts = [BigInt(slot===1?1:0), BigInt(slot===2?1:0), BigInt(slot===3?1:0)];
                              const result = await callMethod({ sender:activeAddr, signer:makeSigner(), appId,
                                methodName:"lock_asa", methodArgs:amts,
                                assetTransfer:{ assetId:existInfo.id, amount:1 }, foreignAssets:[existInfo.id] });
                              toast.success(<span>NFT #{existInfo.id} locked for slot {slot}! <TxLink txId={result.txId} /></span>);
                              onRefresh?.();
                            } catch (e) { toast.error(parseActionError(e, "Lock NFT"), { autoClose: 8000 }); }
                            finally { setExistLock(false); }
                          }}>
                          {existLock ? <><span className="spinner" /> Lockingâ€¦</> : `Slot ${slot}${addr ? ` (${addr.slice(0,6)}â€¦)` : " (empty)"}`}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="card" style={{ background:"var(--bg)" }}>
        <h3 style={{ marginBottom:10 }}>About ARC-3 NFTs on Algorand</h3>
        <div className="text-muted" style={{ fontSize:13, lineHeight:1.8 }}>
          <p><strong>ARC-3</strong> is the Algorand standard for NFTs with off-chain IPFS metadata.</p>
          <p><strong>On IPFS (Pinata):</strong> Image file + JSON (name, description, image CID, properties)</p>
          <p>\u26D3\uFE0F <strong>On Algorand:</strong> ASA with <code>url = ipfs://&lt;CID&gt;#arc3</code>, total = 1, decimals = 0</p>
          <p><strong>Immutability:</strong> IPFS content is content-addressed \u2014 CID = cryptographic hash of content</p>
          <p><strong>Why Pinata?</strong> Pinata pins your content so it stays available on IPFS indefinitely</p>
        </div>
      </div>
    </div>
  );
}
