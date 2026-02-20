// ─────────────────────────────────────────────────────────────────────────────
// BeneficiaryPanel.js — Show beneficiaries and allow claiming
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { useWallet } from "./WalletContext";
import { callMethod, toAlgo, EXPLORER_BASE } from "../algorand";
import algosdk from "algosdk";
import { toast } from "react-toastify";

export default function BeneficiaryPanel({ state, appId, onRefresh }) {
  const { activeAddr, makeSigner } = useWallet();
  const [loading, setLoading] = useState(null);

  if (!state || !state.will_created) return null;

  const isActive = Number(state.inheritance_active) === 1;
  const timeRemaining = Number(state.time_remaining ?? 0);
  const canActivate = timeRemaining === 0 && Number(state.will_created) === 1;

  const beneficiaries = [
    { slot: 1, address: state.beneficiary1_address, percent: Number(state.beneficiary1_percent ?? 0), claimed: Number(state.beneficiary1_claimed) === 1 },
    { slot: 2, address: state.beneficiary2_address, percent: Number(state.beneficiary2_percent ?? 0), claimed: Number(state.beneficiary2_claimed) === 1 },
    { slot: 3, address: state.beneficiary3_address, percent: Number(state.beneficiary3_percent ?? 0), claimed: Number(state.beneficiary3_claimed) === 1 },
  ];

  const totalLocked = Number(state.total_locked ?? 0);

  const handleClaim = async (slot) => {
    if (!activeAddr) return toast.error("Connect wallet first");
    setLoading(slot);
    try {
      const signer = makeSigner();
      const result = await callMethod({
        sender: activeAddr,
        signer,
        methodName: "claim",
        appId: appId,
        methodArgs: [BigInt(slot)],
      });
      const payout = Number(result.returnValue ?? 0);
      toast.success(
        <span>
          Claimed {toAlgo(payout)} ALGO!{" "}
          <a
            href={`${EXPLORER_BASE}/tx/${result.txId}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)" }}
          >
            View Tx ↗
          </a>
        </span>
      );
      onRefresh?.();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Claim failed");
    } finally {
      setLoading(null);
    }
  };

  const handleActivate = async () => {
    if (!activeAddr) return toast.error("Connect wallet first");
    setLoading("activate");
    try {
      const signer = makeSigner();
      await callMethod({
        sender: activeAddr,
        signer,
        methodName: "activate_inheritance",
        appId: appId,
        methodArgs: [],
      });
      toast.success("Inheritance activated!");
      onRefresh?.();
    } catch (err) {
      toast.error(err.message || "Activation failed — inactivity period may not have elapsed");
    } finally {
      setLoading(null);
    }
  };

  const handleForceActivate = async () => {
    if (!activeAddr) return toast.error("Connect wallet first");
    setLoading("force");
    try {
      const signer = makeSigner();
      await callMethod({
        sender: activeAddr,
        signer,
        methodName: "force_activate",
        appId: appId,
        methodArgs: [],
      });
      toast.success("Inheritance force-activated!");
      onRefresh?.();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Force activate failed");
    } finally {
      setLoading(null);
    }
  };

  const appAddress = appId ? algosdk.getApplicationAddress(appId) : "";
  const isOwner = activeAddr && state.owner === activeAddr;

  return (
    <div className="card">
      <h2>Beneficiaries</h2>

      {beneficiaries.map((b) => (
        <div className="beneficiary-row" key={b.slot}>
          <div className="beneficiary-slot">{b.slot}</div>
          <div className="beneficiary-info">
            <div className="beneficiary-address">
              {b.address || <span style={{ color: "var(--text-muted)" }}>—</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              ≈ {toAlgo(Math.floor((totalLocked * b.percent) / 100))} ALGO
            </div>
          </div>
          <div className="beneficiary-percent">{b.percent}%</div>

          {b.claimed ? (
            <span className="claimed-tag">✓ Claimed</span>
          ) : isActive && activeAddr === b.address ? (
            <button
              className="btn btn-gold"
              disabled={!!loading}
              onClick={() => handleClaim(b.slot)}
            >
              {loading === b.slot ? <><span className="spinner" /> Claiming…</> : "Claim"}
            </button>
          ) : (
            <span className="text-muted" style={{ fontSize: 12 }}>
              {isActive ? "Wrong wallet" : "Waiting"}
            </span>
          )}
        </div>
      ))}

      {/* Activate / Force Activate buttons */}
      {!isActive && (
        <>
          <hr className="divider" />
          {canActivate ? (
            <>
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                Inactivity period elapsed! Inheritance can now be activated.
              </div>
              <button
                className="btn btn-danger"
                disabled={!!loading}
                onClick={handleActivate}
                style={{ width: "100%" }}
              >
                {loading === "activate" ? <><span className="spinner" /> Activating…</> : "Activate Inheritance"}
              </button>
            </>
          ) : (
            <div className="alert alert-info" style={{ textAlign: "center", marginTop: 8 }}>
              Activation unlocks in <strong>{timeRemaining}s</strong> (owner still active)
            </div>
          )}

          {/* Force Activate — owner only, skips countdown */}
          {isOwner && (
            <button
              className="btn btn-danger"
              disabled={!!loading}
              onClick={handleForceActivate}
              style={{ width: "100%", marginTop: 10, opacity: 0.85, border: "1px dashed #ff6b6b" }}
            >
              {loading === "force" ? <><span className="spinner" /> Force Activating…</> : "Force Activate (Owner Only)"}
            </button>
          )}
        </>
      )}

      {/* Contract address */}
      <hr className="divider" />
      <div style={{ fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all", textAlign: "center" }}>
        <span style={{ marginRight: 6 }}>Contract Address:</span>
        <a
          href={`${EXPLORER_BASE}/address/${appAddress}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", fontFamily: "monospace" }}
        >
          {appAddress}
        </a>
      </div>
    </div>
  );
}


