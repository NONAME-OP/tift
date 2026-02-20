// ─────────────────────────────────────────────────────────────────────────────
// Navbar.js
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { useWallet } from "./WalletContext";
import { toAlgo, APP_ID, EXPLORER_BASE } from "../algorand";

export default function Navbar() {
  const { isConnected, activeAddr, balance, connect, disconnect, connecting } = useWallet();

  const short = (addr) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <div className="navbar-logo-icon" />
        Algo<span>Legacy</span>
        {APP_ID > 0 && (
          <a
            className="explorer-link"
            href={`${EXPLORER_BASE}/application/${APP_ID}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}
          >
            #{APP_ID} ↗
          </a>
        )}
      </div>

      <div className="flex-row">
        {isConnected ? (
          <>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: '0.03em' }}>
              {short(activeAddr)}&nbsp;&nbsp;
              <strong style={{ color: "var(--accent-green)" }}>
                {toAlgo(balance)} ALGO
              </strong>
            </span>
            <button className="btn btn-outline" onClick={disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={connect} disabled={connecting}>
            {connecting ? <><span className="spinner" /> Connecting…</> : "Connect Pera Wallet"}
          </button>
        )}
      </div>
    </nav>
  );
}
