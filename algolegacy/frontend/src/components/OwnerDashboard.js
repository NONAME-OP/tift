// ─────────────────────────────────────────────────────────────────────────────
// OwnerDashboard.js — Check-in, deposit, revoke, status for the owner
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { useWallet } from "./WalletContext";
import { callMethod, APP_ID, toAlgo, toMicro, EXPLORER_BASE } from "../algorand";
import CountdownTimer from "./CountdownTimer";
import { toast } from "react-toastify";

export default function OwnerDashboard({ state, onRefresh }) {
  const { activeAddr, makeSigner } = useWallet();
  const [depositAmt, setDepositAmt] = useState(1);
  const [loading, setLoading]       = useState(null);

  if (!state || !state.will_created) return null;

  const isActive = Number(state.inheritance_active) === 1;
  const remaining = Number(state.time_remaining ?? 0);

  const doCall = async (label, methodName, methodArgs = [], payment = null) => {
    if (!activeAddr) return toast.error("Connect wallet first");
    setLoading(label);
    try {
      const signer = makeSigner();
      const result = await callMethod({
        sender: activeAddr,
        signer,
        methodName,
        appId: APP_ID,
        methodArgs,
        payment,
      });
      toast.success(
        <span>
          ✅ {label} success!{" "}
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
      toast.error(err.message || "Transaction failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Locked Balance</div>
          <div className="stat-value green">{toAlgo(Number(state.total_locked ?? 0))} ALGO</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inactivity Period</div>
          <div className="stat-value purple">
            {Math.round(Number(state.inactivity_period ?? 0) / 86400)}d
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div style={{ marginTop: 6 }}>
            {isActive ? (
              <span className="status-badge status-active">🔴 ACTIVE</span>
            ) : remaining === 0 ? (
              <span className="status-badge status-ready">⚡ READY</span>
            ) : (
              <span className="status-badge status-alive">🟢 ALIVE</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Countdown ──────────────────────────────────────────── */}
      {!isActive && (
        <div className="card">
          <h2>⏳ Inactivity Countdown</h2>
          <CountdownTimer secondsRemaining={remaining} />
        </div>
      )}

      {isActive && (
        <div className="alert alert-danger">
          🚨 <strong>Inheritance is ACTIVE.</strong> Beneficiaries can now claim their funds.
          Check-in and deposits are disabled.
        </div>
      )}

      {/* ── Deposit ─────────────────────────────────────────────── */}
      {!isActive && (
        <div className="card">
          <h2>💰 Deposit ALGO into Will</h2>
          <div className="flex-row">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <input
                type="number"
                min={1}
                step={0.5}
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                placeholder="Amount in ALGO"
              />
            </div>
            <button
              className="btn btn-success"
              disabled={!!loading}
              onClick={() => doCall("Deposit", "deposit", [], toMicro(depositAmt))}
            >
              {loading === "Deposit" ? <><span className="spinner" /> Depositing…</> : "💰 Deposit"}
            </button>
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────── */}
      {!isActive && (
        <div className="card">
          <h2>⚡ Owner Actions</h2>
          <div className="flex-row">
            <button
              className="btn btn-primary"
              disabled={!!loading}
              onClick={() => doCall("Check-In", "check_in")}
            >
              {loading === "Check-In" ? (
                <><span className="spinner" /> Checking In…</>
              ) : (
                "✅ Check-In (Proof of Life)"
              )}
            </button>

            <button
              className="btn btn-danger"
              disabled={!!loading}
              onClick={() => {
                if (window.confirm("Revoke will and reclaim all funds? This cannot be undone.")) {
                  doCall("Revoke Will", "revoke_will");
                }
              }}
            >
              {loading === "Revoke Will" ? (
                <><span className="spinner" /> Revoking…</>
              ) : (
                "🗑 Revoke Will"
              )}
            </button>
          </div>
          <p className="text-muted" style={{ marginTop: 12 }}>
            Check in regularly to reset the inactivity clock. Revoke permanently cancels
            the will and returns funds to you.
          </p>
        </div>
      )}
    </div>
  );
}
