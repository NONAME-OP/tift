// ─────────────────────────────────────────────────────────────────────────────
// CreateWillForm.js — Owner sets up the will + beneficiaries
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import algosdk from "algosdk";
import { useWallet } from "./WalletContext";
import { callMethod, APP_ID } from "../algorand";
import { toast } from "react-toastify";

const DEFAULT_PERIOD_MINS = 2; // default 2 minutes for demo

export default function CreateWillForm({ onSuccess }) {
  const { activeAddr, makeSigner } = useWallet();

  const [period, setPeriod]   = useState(DEFAULT_PERIOD_MINS);
  const [loading, setLoading] = useState(false);

  const [b1, setB1] = useState({ address: "", percent: 50 });
  const [b2, setB2] = useState({ address: "", percent: 30 });
  const [b3, setB3] = useState({ address: "", percent: 20 });

  const totalPct = Number(b1.percent) + Number(b2.percent) + Number(b3.percent);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeAddr) return toast.error("Connect your wallet first");
    if (!APP_ID)     return toast.error("APP_ID not set — deploy the contract first");
    if (totalPct !== 100) return toast.error("Beneficiary percentages must sum to 100%");

    // Trim and validate addresses
    const addr1 = b1.address.trim();
    const addr2 = b2.address.trim();
    const addr3 = b3.address.trim();

    if (!addr1) return toast.error("Beneficiary 1 address is required");
    if (!addr2) return toast.error("Beneficiary 2 address is required");
    if (!addr3) return toast.error("Beneficiary 3 address is required");
    if (!algosdk.isValidAddress(addr1)) return toast.error("Beneficiary 1: invalid Algorand address");
    if (!algosdk.isValidAddress(addr2)) return toast.error("Beneficiary 2: invalid Algorand address");
    if (!algosdk.isValidAddress(addr3)) return toast.error("Beneficiary 3: invalid Algorand address");

    setLoading(true);
    try {
      const signer = makeSigner();
      const result = await callMethod({
        sender: activeAddr,
        signer,
        methodName: "create_will",
        appId: APP_ID,
        methodArgs: [
          BigInt(Math.floor(period * 60)),   // minutes → seconds
          addr1,
          BigInt(Number(b1.percent)),
          addr2,
          BigInt(Number(b2.percent)),
          addr3,
          BigInt(Number(b3.percent)),
        ],
      });
      toast.success(`✅ Will created! Tx: ${result.txId?.slice(0, 8)}…`);
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>📜 Create Your Will</h2>

      <form onSubmit={handleSubmit}>
        {/* Inactivity period */}
        <div className="form-group">
          <label>Inactivity Period (minutes)</label>
          <input
            type="number"
            min={1}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="e.g. 2 (2 minutes for demo)"
          />
          <p className="text-muted" style={{ marginTop: 4 }}>
            If you miss check-in for this many minutes, inheritance activates automatically.
          </p>
        </div>

        <hr className="divider" />
        <p style={{ fontWeight: 700, marginBottom: 12 }}>
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

        {/* Beneficiary 1 */}
        <BeneficiaryInput label="Beneficiary 1" value={b1} onChange={setB1} />
        {/* Beneficiary 2 */}
        <BeneficiaryInput label="Beneficiary 2" value={b2} onChange={setB2} />
        {/* Beneficiary 3 */}
        <BeneficiaryInput label="Beneficiary 3" value={b3} onChange={setB3} />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || totalPct !== 100}
          style={{ marginTop: 8, width: "100%" }}
        >
          {loading ? <><span className="spinner" /> Creating Will…</> : "🏛 Create Will"}
        </button>
      </form>
    </div>
  );
}

function BeneficiaryInput({ label, value, onChange }) {
  return (
    <div className="form-row" style={{ marginBottom: 12 }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>{label} Address</label>
        <input
          type="text"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value.trim() })}
          placeholder="ALGO address (58 characters)…"
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Share %</label>
        <input
          type="number"
          min={0}
          max={100}
          value={value.percent}
          onChange={(e) => onChange({ ...value, percent: e.target.value })}
        />
      </div>
    </div>
  );
}
