// ─────────────────────────────────────────────────────────────────────────────
// App.js — Root component
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { WalletProvider, useWallet } from "./components/WalletContext";
import Navbar               from "./components/Navbar";
import CreateWillForm       from "./components/CreateWillForm";
import OwnerDashboard       from "./components/OwnerDashboard";
import BeneficiaryPanel     from "./components/BeneficiaryPanel";
import { getAppGlobalState, APP_ID, EXPLORER_BASE } from "./algorand";

// ── Inner app (needs wallet context) ──────────────────────────────────────────
function AppInner() {
  const { isConnected, activeAddr } = useWallet();
  const [state, setState]           = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchState = useCallback(async () => {
    if (!APP_ID) { setState(null); return; }
    setRefreshing(true);
    try {
      const raw = await getAppGlobalState(APP_ID);
      setState(raw);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll every 10 seconds so the countdown auto-refreshes
  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10_000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const willExists = state && Number(state.will_created) === 1;
  const isOwner    = state && activeAddr && state.owner === activeAddr;

  return (
    <div className="app-wrapper">
      <Navbar />

      <main className="main-content">
        {/* ── Hero ────────────────────────────────────────────── */}
        <div className="hero">
          <h1>On-Chain Inheritance,<br />Secured by Algorand</h1>
          <p>
            Lock funds on-chain. Beneficiaries claim automatically if you
            miss your check-in window. Fully trustless, no lawyers needed.
          </p>
          {APP_ID > 0 && (
            <a
              className="explorer-link"
              href={`${EXPLORER_BASE}/application/${APP_ID}`}
              target="_blank"
              rel="noreferrer"
              style={{ justifyContent: "center" }}
            >
              View contract on AlgoExplorer ↗
            </a>
          )}
        </div>

        {/* ── Not connected ────────────────────────────────────── */}
        {!isConnected && (
          <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>🔗</p>
            <h2 style={{ marginBottom: 8 }}>Connect Your Wallet</h2>
            <p className="text-muted">
              Connect your Pera Wallet to create a will or claim an inheritance.
            </p>
          </div>
        )}

        {/* ── No app ID warning ────────────────────────────────── */}
        {isConnected && !APP_ID && (
          <div className="alert alert-warning">
            ⚠️ <strong>APP_ID not configured.</strong> Deploy the contract with{" "}
            <code>algokit deploy testnet</code> and set{" "}
            <code>REACT_APP_APP_ID=&lt;your-app-id&gt;</code> in <code>.env</code>.
          </div>
        )}

        {/* ── Refreshing indicator ─────────────────────────────── */}
        {refreshing && (
          <p className="text-muted" style={{ marginBottom: 12 }}>
            🔄 Refreshing state…
          </p>
        )}

        {/* ── No will yet — show creation form ─────────────────── */}
        {isConnected && APP_ID > 0 && !willExists && (
          <CreateWillForm onSuccess={fetchState} />
        )}

        {/* ── Will exists — show dashboards ────────────────────── */}
        {isConnected && APP_ID > 0 && willExists && (
          <>
            {isOwner && <OwnerDashboard state={state} onRefresh={fetchState} />}
            <BeneficiaryPanel state={state} onRefresh={fetchState} />
          </>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer
        style={{
          textAlign: "center",
          padding: "24px",
          color: "var(--text-muted)",
          fontSize: 13,
          borderTop: "1px solid var(--border)",
        }}
      >
        🏛 AlgoLegacy — Built on Algorand Testnet &nbsp;·&nbsp;
        <a
          href="https://github.com/your-repo/algolegacy"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)" }}
        >
          GitHub ↗
        </a>
      </footer>

      <ToastContainer
        position="bottom-right"
        theme="dark"
        autoClose={5000}
        toastStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      />
    </div>
  );
}

// ── Root with providers ───────────────────────────────────────────────────────
export default function App() {
  return (
    <WalletProvider>
      <AppInner />
    </WalletProvider>
  );
}
