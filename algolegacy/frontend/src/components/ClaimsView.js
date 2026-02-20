// ─────────────────────────────────────────────────────────────────────────────
// ClaimsView.js
//
// Scans ALL stored will IDs for the connected wallet.
// For each will where the wallet is a beneficiary (ALGO or token/NFT),
// renders a claim card showing every pending and claimable item.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from "react";
import {
  getAppGlobalState,
  callMethod,
  toAlgo,
  EXPLORER_BASE,
  optInToAsa,
  isOptedInToAsa,
  algodClient,
  discoverBeneficiaryWills,
} from "../algorand";
import { toast } from "react-toastify";
import algosdk from "algosdk";

// ── tiny helpers ──────────────────────────────────────────────────────────────
const short = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

const TxLink = ({ txId }) =>
  txId ? (
    <a
      href={`${EXPLORER_BASE}/tx/${txId}`}
      target="_blank"
      rel="noreferrer"
      style={{ color: "var(--accent)", marginLeft: 6 }}
    >
      View Tx ↗
    </a>
  ) : null;

// Fetch ASA metadata once
const asaCache = {};
async function getAsaInfo(id) {
  if (asaCache[id]) return asaCache[id];
  try {
    const info = await algodClient.getAssetByID(Number(id)).do();
    const p = info.params;
    const result = {
      name:     p.name        ?? `ASA #${id}`,
      unitName: p["unit-name"] ?? "",
      decimals: p.decimals    ?? 0,
    };
    asaCache[id] = result;
    return result;
  } catch {
    return { name: `ASA #${id}`, unitName: "", decimals: 0 };
  }
}

function toDisplay(units, decimals) {
  if (decimals === 0) return units.toString();
  return (units / Math.pow(10, decimals)).toFixed(decimals);
}

// ─────────────────────────────────────────────────────────────────────────────
// SingleWillClaimCard — renders all claims for ONE will
// ─────────────────────────────────────────────────────────────────────────────
function SingleWillClaimCard({ willId, activeAddr, makeSigner, onAnyChange }) {
  const [state,       setState]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [algoLoading, setAlgoLoading] = useState(false);
  const [asaInfo,     setAsaInfo]     = useState(null);
  const [myOptedIn,   setMyOptedIn]   = useState(false);
  const [optInLoading,setOptInLoading]= useState(false);
  const [expanded,    setExpanded]    = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const s = await getAppGlobalState(willId);
      setState(s);
    } catch { setState(null); }
  }, [willId]);

  useEffect(() => { fetchState(); }, [fetchState]);

  // fetch ASA info when we know lockedId
  useEffect(() => {
    if (!state) return;
    const lockedId = Number(state.locked_asa_id ?? 0);
    if (lockedId > 0) getAsaInfo(lockedId).then(setAsaInfo);
  }, [state]);

  // check beneficiary's opt-in status
  useEffect(() => {
    if (!state || !activeAddr) return;
    const lockedId = Number(state.locked_asa_id ?? 0);
    if (lockedId > 0) {
      isOptedInToAsa(activeAddr, lockedId).then(setMyOptedIn).catch(() => setMyOptedIn(false));
    }
  }, [state, activeAddr]);

  if (!state || !Number(state.will_created)) return null;

  const isActive   = Number(state.inheritance_active) === 1;
  const lockedId   = Number(state.locked_asa_id ?? 0);
  const totalLocked = Number(state.total_locked ?? 0);
  const timeRemaining = Number(state.time_remaining ?? 0);
  const canActivate = timeRemaining === 0 && Number(state.will_created) === 1 && !isActive;

  // Find this wallet's ALGO slot — only if ALGO was actually locked
  const algoSlots = totalLocked > 0
    ? [1, 2, 3]
        .map((slot) => ({
          slot,
          address: state[`beneficiary${slot}_address`] ?? "",
          percent: Number(state[`beneficiary${slot}_percent`] ?? 0),
          claimed: Number(state[`beneficiary${slot}_claimed`] ?? 0) === 1,
        }))
        .filter((b) => b.address === activeAddr && b.percent > 0)
    : [];

  // Find this wallet's token/NFT slot
  const asaSlots = [1, 2, 3]
    .map((slot) => ({
      slot,
      address:   state[`beneficiary${slot}_address`] ?? "",
      asaAmount: Number(state[`b${slot}_asa_amount`] ?? 0),
      asaClaimed:Number(state[`b${slot}_asa_claimed`] ?? 0) === 1,
    }))
    .filter((b) => b.address === activeAddr && b.asaAmount > 0);

  // Also check if wallet has percent assignment even without locked ALGO (show NFT-only card)
  const hasAlgoAllocation = [1,2,3].some(
    (slot) => (state[`beneficiary${slot}_address`] ?? "") === activeAddr &&
              Number(state[`beneficiary${slot}_percent`] ?? 0) > 0
  );

  // Skip completely if this wallet has nothing in this will
  if (algoSlots.length === 0 && asaSlots.length === 0 && !hasAlgoAllocation) return null;

  const appAddress = algosdk.getApplicationAddress(willId);

  // ── ALGO claim handler ──────────────────────────────────────────────────
  const handleAlgoClaim = async (slot) => {
    setAlgoLoading(true);
    try {
      if (canActivate && !isActive) await ensureActivated();
      const result = await callMethod({
        sender: activeAddr,
        signer: makeSigner(),
        methodName: "claim",
        appId: willId,
        methodArgs: [BigInt(slot)],
      });
      const payout = Number(result.returnValue ?? 0);
      toast.success(
        <span>Claimed {toAlgo(payout)} ALGO! <TxLink txId={result.txId} /></span>
      );
      await fetchState();
      onAnyChange?.();
    } catch (e) {
      toast.error(e.message || "ALGO claim failed");
    } finally {
      setAlgoLoading(false);
    }
  };

  // ── ASA claim handler ───────────────────────────────────────────────────
  const handleAsaClaim = async (slot) => {
    setLoading(true);
    try {
      if (canActivate && !isActive) await ensureActivated();
      const fresh   = await getAppGlobalState(willId);
      const freshId = Number(fresh?.locked_asa_id ?? 0);
      if (!freshId) return toast.error("No ASA locked — refresh and try again");
      const result = await callMethod({
        sender: activeAddr,
        signer: makeSigner(),
        methodName: "claim_asa",
        appId: willId,
        methodArgs:    [BigInt(slot)],
        foreignAssets: [freshId],
        accounts:      [activeAddr],
      });
      toast.success(<span>ASA claimed! <TxLink txId={result.txId} /></span>);
      await fetchState();
      onAnyChange?.();
    } catch (e) {
      toast.error(e.message || "ASA claim failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Opt-in handler ──────────────────────────────────────────────────────
  const handleOptIn = async () => {
    setOptInLoading(true);
    try {
      const fresh   = await getAppGlobalState(willId);
      const freshId = Number(fresh?.locked_asa_id ?? lockedId);
      if (!freshId) return toast.error("No ASA locked in this will");
      const r = await optInToAsa(activeAddr, makeSigner(), freshId);
      setMyOptedIn(true);
      toast.success(<span>Opted in to ASA #{freshId}! <TxLink txId={r.txId} /></span>);
    } catch (e) {
      toast.error(e.message || "Opt-in failed");
    } finally {
      setOptInLoading(false);
    }
  };

  // ── Auto-activate helper (transparent to beneficiary) ─────────────────
  const ensureActivated = async () => {
    const fresh = await getAppGlobalState(willId);
    if (Number(fresh?.inheritance_active) === 1) return; // already active
    await callMethod({
      sender: activeAddr,
      signer: makeSigner(),
      methodName: "activate_inheritance",
      appId: willId,
      methodArgs: [],
    });
    toast.info("Inheritance activated automatically");
  };

  // Determine overall status label
  const allAlgoClaimed = algoSlots.every((b) => b.claimed);
  const allAsaClaimed  = asaSlots.every((b) => b.asaClaimed);
  const everythingClaimed = allAlgoClaimed && allAsaClaimed;
  const statusColor = everythingClaimed
    ? "#10b981"
    : (isActive || canActivate)
    ? "#f59e0b"
    : "#6366f1";
  const statusLabel = everythingClaimed
    ? "✓ All Claimed"
    : (isActive || canActivate)
    ? "Claim Now"
    : "Pending";

  return (
    <div
      className="card"
      style={{
        border: `1px solid ${(isActive || canActivate) ? "rgba(245,158,11,0.4)" : "rgba(99,102,241,0.3)"}`,
        marginBottom: 20,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          marginBottom: expanded ? 16 : 0,
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Will #{willId}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Contract:{" "}
            <a
              href={`${EXPLORER_BASE}/address/${appAddress}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {short(appAddress)}
            </a>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className="status-badge"
            style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}55` }}
          >
            {statusLabel}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 18 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {!expanded ? null : (
        <>
          {/* ── Timer pending banner ── */}
          {!isActive && !canActivate && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(99,102,241,0.06)",
                border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 10,
                marginBottom: 14,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              Inheritance not yet active — owner check-in timer: <strong>{timeRemaining}s remaining</strong>
            </div>
          )}

          {/* ── ALGO Claims ── */}
          {(algoSlots.length > 0 || (hasAlgoAllocation && totalLocked === 0)) && (
            <div style={{ marginBottom: asaSlots.length > 0 ? 16 : 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 18 }}></span>
                <strong style={{ fontSize: 14 }}>ALGO Inheritance</strong>
              </div>
              {hasAlgoAllocation && totalLocked === 0 && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 12px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  You have an ALGO allocation but no ALGO has been locked into this will yet.
                </div>
              )}
              {algoSlots.map((b) => {
                const algoAmt = toAlgo(Math.floor((totalLocked * b.percent) / 100));
                return (
                  <div
                    key={b.slot}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--bg)",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      marginBottom: 8,
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Slot #{b.slot}</span>
                      <span style={{ marginLeft: 10, color: "#10b981", fontWeight: 700 }}>
                        ≈ {algoAmt} ALGO
                      </span>
                      <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 12 }}>
                        ({b.percent}% of {toAlgo(totalLocked)} ALGO locked)
                      </span>
                    </div>
                    {b.claimed ? (
                      <span className="status-badge status-active">✓ Claimed</span>
                    ) : (isActive || canActivate) ? (
                      <button
                        className="btn btn-gold"
                        disabled={algoLoading}
                        onClick={() => handleAlgoClaim(b.slot)}
                      >
                        {algoLoading ? <><span className="spinner" /> Claiming…</> : "Claim ALGO"}
                      </button>
                    ) : (
                      <span className="text-muted" style={{ fontSize: 12 }}>Timer running…</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Token / NFT Claims ── */}
          {asaSlots.length > 0 && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 18 }}></span>
                <strong style={{ fontSize: 14 }}>Token / NFT Inheritance</strong>
                {lockedId > 0 && (
                  <a
                    href={`${EXPLORER_BASE}/asset/${lockedId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginLeft: "auto", fontSize: 12, color: "var(--accent)" }}
                  >
                    ASA #{lockedId} ↗
                  </a>
                )}
              </div>

              {/* Opt-in banner — show even before activation */}
              {lockedId > 0 && !myOptedIn && (
                <div
                  style={{
                    padding: "12px 14px",
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.35)",
                    borderRadius: 10,
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: "#f59e0b" }}>
                    You must opt your wallet into{" "}
                    <strong>
                      {asaInfo ? `${asaInfo.name} (${asaInfo.unitName})` : `ASA #${lockedId}`}
                    </strong>{" "}
                    before you can receive it.
                  </p>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "6px 18px", fontSize: 13, whiteSpace: "nowrap" }}
                    disabled={optInLoading}
                    onClick={handleOptIn}
                  >
                    {optInLoading ? <><span className="spinner" /> Opting In…</> : `Opt In to ASA #${lockedId}`}
                  </button>
                </div>
              )}

              {asaSlots.map((b) => {
                const units = asaInfo
                  ? `${toDisplay(b.asaAmount, asaInfo.decimals)} ${asaInfo.unitName || "units"}`
                  : `${b.asaAmount} units`;
                return (
                  <div
                    key={b.slot}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--bg)",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      marginBottom: 8,
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Slot #{b.slot}</span>
                      <span style={{ marginLeft: 10, color: "#10b981", fontWeight: 700 }}>
                        {units}
                      </span>
                      {asaInfo && (
                        <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 12 }}>
                          ({asaInfo.name})
                        </span>
                      )}
                    </div>
                    {b.asaClaimed ? (
                      <span className="status-badge status-active">✓ Claimed</span>
                    ) : (isActive || canActivate) && myOptedIn ? (
                      <button
                        className="btn btn-success"
                        disabled={loading}
                        onClick={() => handleAsaClaim(b.slot)}
                      >
                        {loading ? <><span className="spinner" /> Claiming…</> : `Claim ${units}`}
                      </button>
                    ) : (isActive || canActivate) && !myOptedIn ? (
                      <span style={{ fontSize: 12, color: "#f59e0b" }}>Opt in first</span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: 12 }}>Timer running…</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClaimsView — main export
// Scans all stored will IDs and shows every claim for the connected wallet
// ─────────────────────────────────────────────────────────────────────────────
export default function ClaimsView({ willAppIds, activeAddr, makeSigner, onAddWillId }) {
  const [scanDone, setScanDone] = useState(false);
  const [hasAnyClaim, setHasAnyClaim] = useState(false);
  const [tick, setTick] = useState(0);
  const [addId, setAddId] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  // ── Auto-discover wills from indexer on wallet connect ───────────────────
  useEffect(() => {
    if (!activeAddr) return;
    let cancelled = false;
    setDiscovering(true);
    discoverBeneficiaryWills(activeAddr)
      .then((found) => {
        if (cancelled) return;
        let added = 0;
        for (const id of found) {
          if (!willAppIds.includes(id)) {
            onAddWillId?.(id);
            added++;
          }
        }
        if (added > 0) console.log(`[ClaimsView] Auto-discovered ${added} will(s)`);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDiscovering(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddr]);

  const handleAddWill = async () => {
    const id = parseInt(addId.trim(), 10);
    if (!id || isNaN(id)) return toast.error("Enter a valid App ID number");
    if (willAppIds.includes(id)) { toast.info("Already tracking this will"); return; }
    setAddLoading(true);
    try {
      const s = await getAppGlobalState(id);
      if (!s || !Number(s.will_created)) {
        toast.error("No valid will found for App ID " + id);
        return;
      }
      onAddWillId?.(id);
      setAddId("");
      toast.success(`\u2705 Will #${id} added to your claims!`);
    } catch (e) {
      toast.error("Could not fetch will: " + (e.message || e));
    } finally {
      setAddLoading(false);
    }
  };

  const AddWillInput = (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 16,
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      <input
        type="number"
        placeholder="Paste Will App ID (e.g. 755788964)"
        value={addId}
        onChange={(e) => setAddId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAddWill()}
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 14,
          width: 260,
        }}
      />
      <button
        className="btn btn-primary"
        disabled={addLoading}
        onClick={handleAddWill}
        style={{ padding: "8px 20px" }}
      >
        {addLoading ? <><span className="spinner" />&nbsp;Checking…</> : "Add Will"}
      </button>
    </div>
  );

  // After a claim action, force a refresh tick
  const handleAnyChange = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  // Scan all wills to know if ANY has a claim (for the empty state message)
  useEffect(() => {
    if (!activeAddr || willAppIds.length === 0) {
      setScanDone(true);
      setHasAnyClaim(false);
      return;
    }
    setScanDone(false);
    let cancelled = false;
    Promise.all(
      willAppIds.map(async (id) => {
        try {
          const s = await getAppGlobalState(id);
          if (!s || !Number(s.will_created)) return false;
          const inAlgo = [1, 2, 3].some(
            (slot) =>
              (s[`beneficiary${slot}_address`] ?? "") === activeAddr &&
              Number(s[`beneficiary${slot}_percent`] ?? 0) > 0
          );
          const inAsa = [1, 2, 3].some(
            (slot) =>
              (s[`beneficiary${slot}_address`] ?? "") === activeAddr &&
              Number(s[`b${slot}_asa_amount`] ?? 0) > 0
          );
          return inAlgo || inAsa;
        } catch {
          return false;
        }
      })
    ).then((results) => {
      if (!cancelled) {
        setHasAnyClaim(results.some(Boolean));
        setScanDone(true);
      }
    });
    return () => { cancelled = true; };
  }, [activeAddr, willAppIds, tick]);

  if (!activeAddr) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}></p>
        <h2 style={{ marginBottom: 8 }}>Connect Your Wallet</h2>
        <p className="text-muted">Connect a wallet to see your inheritance claims.</p>
      </div>
    );
  }

  if (discovering) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}></p>
        <h2 style={{ marginBottom: 8 }}>Scanning for Claims…</h2>
        <p className="text-muted">Checking the blockchain for wills you’re named in. This may take a few seconds.</p>
        <span className="spinner" style={{ display: "inline-block", marginTop: 16, width: 28, height: 28 }} />
      </div>
    );
  }

  if (willAppIds.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}></p>
        <h2 style={{ marginBottom: 8 }}>No Wills Found</h2>
        <p className="text-muted">
          You haven’t created a will yet, or the owner shared a Will App ID with you.
          Paste it below to see your claims.
        </p>
        {AddWillInput}
      </div>
    );
  }

  if (scanDone && !hasAnyClaim) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}></p>
        <h2 style={{ marginBottom: 8 }}>No Claims Found</h2>
        <p className="text-muted">
          Your wallet ({short(activeAddr)}) has no ALGO, token, or NFT allocations
          in any of the {willAppIds.length} stored will{willAppIds.length > 1 ? "s" : ""}.
        </p>
        <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
          Stored wills: {willAppIds.join(", ")}
        </p>
        <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
          If another will was created for you, add its App ID:
        </p>
        {AddWillInput}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          marginBottom: 20,
          padding: "18px 24px",
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 16,
        }}
      >
        <h2 style={{ marginBottom: 4 }}>All Your Claims</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Showing ALGO, token &amp; NFT claims across all {willAppIds.length} stored will
          {willAppIds.length > 1 ? "s" : ""} for{" "}
          <strong style={{ fontFamily: "monospace" }}>{short(activeAddr)}</strong>.
        </p>
        {/* Inline add-will input in the header */}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="number"
            placeholder="Add another Will App ID…"
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddWill()}
            style={{
              padding: "6px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 13,
              width: 240,
            }}
          />
          <button
            className="btn btn-primary"
            disabled={addLoading}
            onClick={handleAddWill}
            style={{ padding: "6px 14px", fontSize: 13 }}
          >
            {addLoading ? <><span className="spinner" />&nbsp;Checking…</> : "+ Add"}
          </button>
        </div>
      </div>

      {/* One card per will — SingleWillClaimCard hides itself if wallet has no claim there */}
      {willAppIds.map((willId) => (
        <SingleWillClaimCard
          key={`${willId}-${tick}`}
          willId={willId}
          activeAddr={activeAddr}
          makeSigner={makeSigner}
          onAnyChange={handleAnyChange}
        />
      ))}
    </div>
  );
}
