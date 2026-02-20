// ─────────────────────────────────────────────────────────────────────────────
// OwnerDashboard.js — Check-in, deposit, revoke, status for the owner
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { useWallet } from "./WalletContext";
import { callMethod, toAlgo, toMicro, EXPLORER_BASE } from "../algorand";
import CountdownTimer from "./CountdownTimer";
import { toast } from "react-toastify";
import { parseActionError } from "../utils/errorMessages";

export default function OwnerDashboard({ state, appId, onRefresh }) {
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
        appId: appId,
        methodArgs,
        payment,
      });
      toast.success(
        <span>
          {label} success!{" "}
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
      toast.error(parseActionError(err, label), { autoClose: 8000 });
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
              <span className="status-badge status-active">ACTIVE</span>
            ) : remaining === 0 ? (
              <span className="status-badge status-ready">READY</span>
            ) : (
              <span className="status-badge status-alive">ALIVE</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Countdown ──────────────────────────────────────────── */}
      {!isActive && (
        <div className="card">
          <h2>Inactivity Countdown</h2>
          <CountdownTimer secondsRemaining={remaining} />
        </div>
      )}

      {isActive && (
        <div className="alert alert-danger">
          <strong>Inheritance is ACTIVE.</strong> Beneficiaries can now claim their funds.
          Check-in and deposits are disabled.
        </div>
      )}

      {/* ── Deposit ─────────────────────────────────────────────── */}
      {!isActive && (
        <div className="card">
          <h2>Deposit ALGO into Will</h2>
          <div className="flex-row">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Amount (ALGO)</label>
              <input
                type="number"
                min={1}
                step={0.5}
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                placeholder="e.g. 5"
              />
            </div>
            <button
              className="btn btn-success"
              disabled={!!loading}
              onClick={() => doCall("Deposit", "deposit", [], toMicro(depositAmt))}
            >
              {loading === "Deposit" ? <><span className="spinner" /> Depositing…</> : "Deposit"}
            </button>
          </div>
          <p className="text-muted" style={{ marginTop: 8 }}>
            Minimum 1 ALGO.
          </p>

          {/* ── Force Send ──────────────────────────────────────── */}
          <div
            style={{
              marginTop: 20,
              padding: "14px 16px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.35)",
            }}
          >
            <p style={{ fontSize: 13, marginBottom: 10, color: "var(--text-muted)" }}>
              <strong style={{ color: "#ef4444" }}>Force Send Now</strong> — bypasses the
              inactivity timer and immediately makes funds claimable by beneficiaries.
              Use with caution; this cannot be undone.
            </p>
            <button
              className="btn btn-danger"
              disabled={!!loading}
              style={{ width: "100%" }}
              onClick={() => {
                if (
                  window.confirm(
                    "Force-activate inheritance NOW?\n\nThis ignores the time lock and immediately lets beneficiaries claim. This CANNOT be undone."
                  )
                ) {
                  doCall("Force Send", "force_activate");
                }
              }}
            >
              {loading === "Force Send" ? (
                <><span className="spinner" /> Sending…</>
              ) : (
                "Force Send Funds Now"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────── */}
      {!isActive && (
        <div className="card">
          <h2>Owner Actions</h2>
          <div className="flex-row">
            <button
              className="btn btn-primary"
              disabled={!!loading}
              onClick={() => doCall("Check-In", "check_in")}
            >
              {loading === "Check-In" ? (
                <><span className="spinner" /> Checking In…</>
              ) : (
                "Check-In (Proof of Life)"
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
                "Revoke Will"
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


