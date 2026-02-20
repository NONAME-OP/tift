// ─────────────────────────────────────────────────────────────────────────────
// CreateWillForm.js — Owner sets up the will + beneficiaries (1–3 people)
//   Each will deploys a *new* on-chain app instance so one owner can have
//   multiple simultaneous wills.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import algosdk from "algosdk";
import { useWallet } from "./WalletContext";
import { callMethod, deployWillApp, addStoredWillId } from "../algorand";
import { toast } from "react-toastify";
import { parseError } from "../utils/errorMessages";

// Format a Date as value for datetime-local with seconds granularity
function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) +
    ":" + pad(date.getMinutes()) +
    ":" + pad(date.getSeconds())
  );
}

const defaultDeadline = toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
const emptyBeneficiary = () => ({ address: "", percent: "" });

export default function CreateWillForm({ onSuccess }) {
  const { activeAddr, makeSigner } = useWallet();

  const [deadline, setDeadline] = useState(defaultDeadline);
  const [step, setStep]         = useState(null); // null | "deploying" | "creating"

  // Start with 1 beneficiary; user can add up to 3
  const [beneficiaries, setBeneficiaries] = useState([{ address: "", percent: 100 }]);

  const totalPct = beneficiaries.reduce((sum, b) => sum + Number(b.percent || 0), 0);
  const secondsUntilDeadline = deadline
    ? Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)
    : 0;

  // ── Beneficiary list helpers ─────────────────────────────────────────────
  const addBeneficiary = () => {
    if (beneficiaries.length >= 3) return;
    setBeneficiaries((prev) => [...prev, emptyBeneficiary()]);
  };

  const removeBeneficiary = (idx) => {
    if (beneficiaries.length <= 1) return;
    setBeneficiaries((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateBeneficiary = (idx, field, val) => {
    setBeneficiaries((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: val } : b))
    );
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeAddr)         return toast.error("Connect your wallet first");
    if (totalPct !== 100)    return toast.error("Beneficiary percentages must sum to 100%");
    if (secondsUntilDeadline <= 0) return toast.error("Deadline must be in the future");

    // Validate filled beneficiaries
    for (let i = 0; i < beneficiaries.length; i++) {
      const addr = beneficiaries[i].address.trim();
      if (!addr) return toast.error(`Beneficiary ${i + 1}: address is required`);
      if (!algosdk.isValidAddress(addr))
        return toast.error(`Beneficiary ${i + 1}: invalid Algorand address`);
    }

    // Pad to 3 slots — unused slots get owner address + 0%
    const slots = [...beneficiaries];
    while (slots.length < 3) slots.push({ address: activeAddr, percent: 0 });

    try {
      const signer = makeSigner();

      // ── Step 1: Deploy new app ──────────────────────────────────────────
      setStep("deploying");
      toast.info("Step 1/2 — Deploying new will contract…");
      const newAppId = await deployWillApp(activeAddr, signer);
      toast.success(`Contract deployed (App ID: ${newAppId})`);

      // ── Step 2: Initialise will on-chain ────────────────────────────────
      setStep("creating");
      toast.info("Step 2/2 — Initialising will on-chain…");
      const result = await callMethod({
        sender:     activeAddr,
        signer,
        methodName: "create_will",
        appId:      newAppId,
        methodArgs: [
          BigInt(secondsUntilDeadline),
          slots[0].address.trim(),
          BigInt(Number(slots[0].percent)),
          slots[1].address.trim(),
          BigInt(Number(slots[1].percent)),
          slots[2].address.trim(),
          BigInt(Number(slots[2].percent)),
        ],
      });

      addStoredWillId(activeAddr, newAppId);
      toast.success(`Will created! App ID: ${newAppId}  Tx: ${result.txId?.slice(0, 8)}…`);
      onSuccess?.(newAppId);
    } catch (err) {
      console.error(err);
      toast.error(parseError(err), { autoClose: 8000 });
    } finally {
      setStep(null);
    }
  };

  const loading = step !== null;

  return (
    <div className="card">
      <h2>Create New Will</h2>
      <p className="text-muted" style={{ marginBottom: 20, fontSize: 13 }}>
        Each will is its own on-chain contract. You can create as many as you like.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Inactivity deadline */}
        <div className="form-group">
          <label>Inactivity Deadline (Date, Time &amp; Seconds)</label>
          <input
            type="datetime-local"
            step="1"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <p className="text-muted" style={{ marginTop: 4 }}>
            If you miss check-in until this date &amp; time, inheritance activates automatically.
            {deadline && secondsUntilDeadline > 0 && (
              <span style={{ color: "var(--accent-green)", marginLeft: 6 }}>
                ({Math.floor(secondsUntilDeadline / 86400)}d{" "}
                {Math.floor((secondsUntilDeadline % 86400) / 3600)}h{" "}
                {Math.floor((secondsUntilDeadline % 3600) / 60)}m{" "}
                {secondsUntilDeadline % 60}s from now)
              </span>
            )}
            {deadline && secondsUntilDeadline <= 0 && (
              <span style={{ color: "var(--accent-red)", marginLeft: 6 }}>
                ⚠ Deadline must be in the future
              </span>
            )}
          </p>
        </div>

        <hr className="divider" />

        {/* Beneficiary header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ fontWeight: 700, margin: 0 }}>
            Beneficiaries{" "}
            <span
              style={{
                color: totalPct === 100 ? "var(--accent-green)" : "var(--accent-red)",
                fontSize: 13,
              }}
            >
              ({totalPct}% allocated — must equal 100%)
            </span>
          </p>
          {beneficiaries.length < 3 && (
            <button
              type="button"
              className="btn"
              onClick={addBeneficiary}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                background: "var(--accent-green)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ＋ Add Beneficiary
            </button>
          )}
        </div>

        {/* Beneficiary rows */}
        {beneficiaries.map((b, idx) => (
          <BeneficiaryInput
            key={idx}
            label={`Beneficiary ${idx + 1}`}
            value={b}
            onChangeAddress={(v) => updateBeneficiary(idx, "address", v)}
            onChangePercent={(v) => updateBeneficiary(idx, "percent", v)}
            canRemove={beneficiaries.length > 1}
            onRemove={() => removeBeneficiary(idx)}
          />
        ))}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || totalPct !== 100}
          style={{ marginTop: 8, width: "100%" }}
        >
          {step === "deploying" && <><span className="spinner" /> Deploying contract…</>}
          {step === "creating"  && <><span className="spinner" /> Creating will…</>}
          {!loading             && "Create Will"}
        </button>
      </form>
    </div>
  );
}

function BeneficiaryInput({ label, value, onChangeAddress, onChangePercent, canRemove, onRemove }) {
  return (
    <div
      className="form-row"
      style={{
        marginBottom: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-red)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
            title="Remove beneficiary"
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="form-group" style={{ flex: "1 1 240px", marginBottom: 0 }}>
          <label>Address</label>
          <input
            type="text"
            value={value.address}
            onChange={(e) => onChangeAddress(e.target.value.trim())}
            placeholder="ALGO address (58 characters)…"
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 90px", marginBottom: 0 }}>
          <label>Share %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={value.percent}
            onChange={(e) => onChangePercent(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
