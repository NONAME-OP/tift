// ─────────────────────────────────────────────────────────────────────────────
// App.js — Root component  (multi-will edition)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { WalletProvider, useWallet } from "./components/WalletContext";
import Navbar               from "./components/Navbar";
import { ShootingStars }    from "./components/ShootingStars";
import { StarsBackground }  from "./components/StarsBackground";
import CreateWillForm       from "./components/CreateWillForm";
import OwnerDashboard       from "./components/OwnerDashboard";
import BeneficiaryPanel    from "./components/BeneficiaryPanel";
import DigitalAssetsPanel, { WillTokensTab } from "./components/DigitalAssetsPanel";
import ClaimsView from "./components/ClaimsView";
import {
  getAppGlobalState,
  getStoredWillIds,
  addStoredWillId,
  removeStoredWillId,
  EXPLORER_BASE,
} from "./algorand";

// ── Inner app (needs wallet context) ──────────────────────────────────────────
function AppInner() {
  const { isConnected, activeAddr, makeSigner } = useWallet();

  const [willAppIds,    setWillAppIds]    = useState([]);   // all wills for this wallet
  const [selectedAppId, setSelectedAppId] = useState(null); // currently viewed will
  const [state,         setState]         = useState(null); // on-chain state of selected will
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeTab,     setActiveTab]     = useState("will");   // "will" | "assets" | "claim"
  const [showCreate,    setShowCreate]    = useState(false);    // show CreateWillForm?
  const [claimRefreshKey, setClaimRefreshKey] = useState(0);   // bumped each time claim tab opens

  const switchTab = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === "claim") setClaimRefreshKey((k) => k + 1);
  }, []);

  // Claim-tab will lookup (for beneficiaries who don't own a will)
  const [lookupId,      setLookupId]      = useState("");
  const [lookupState,   setLookupState]   = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState("");

  // Prevent duplicate login notifications
  const notifiedRef = useRef({});

  // ── Load stored will IDs whenever wallet changes ──────────────────────────
  useEffect(() => {
    if (!isConnected || !activeAddr) {
      setWillAppIds([]);
      setSelectedAppId(null);
      setState(null);
      return;
    }
    const ids = getStoredWillIds(activeAddr);
    setWillAppIds(ids);
    // Auto-select the first will if none selected
    if (ids.length > 0) setSelectedAppId(ids[0]);
    else { setSelectedAppId(null); setState(null); }
    setShowCreate(false);
  }, [isConnected, activeAddr]);

  // ── Fetch on-chain state for the selected will ────────────────────────────
  const fetchState = useCallback(async () => {
    if (!selectedAppId) { setState(null); return; }
    setRefreshing(true);
    try {
      const raw = await getAppGlobalState(selectedAppId);
      setState(raw);
    } catch (e) {
      console.error(e);
      setState(null);
    } finally {
      setRefreshing(false);
    }
  }, [selectedAppId]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10_000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // ── Login notification — fire once per wallet+will combination ───────────
  useEffect(() => {
    if (!state || !activeAddr || !selectedAppId) return;
    const key = `${activeAddr}-${selectedAppId}`;
    if (notifiedRef.current[key]) return;
    notifiedRef.current[key] = true;

    const isActive   = Number(state.inheritance_active) === 1;
    const remaining  = Number(state.time_remaining ?? 0);
    const beneficiaries = [
      { addr: state.beneficiary1_address, claimed: Number(state.beneficiary1_claimed) === 1, asaClaimed: Number(state.b1_asa_claimed) === 1, asaAmt: Number(state.b1_asa_amount ?? 0) },
      { addr: state.beneficiary2_address, claimed: Number(state.beneficiary2_claimed) === 1, asaClaimed: Number(state.b2_asa_claimed) === 1, asaAmt: Number(state.b2_asa_amount ?? 0) },
      { addr: state.beneficiary3_address, claimed: Number(state.beneficiary3_claimed) === 1, asaClaimed: Number(state.b3_asa_claimed) === 1, asaAmt: Number(state.b3_asa_amount ?? 0) },
    ];
    const mySlot = beneficiaries.find((b) => b.addr === activeAddr);

    const hasAlgo = !mySlot?.claimed;
    const hasAsa  = !mySlot?.asaClaimed && (mySlot?.asaAmt ?? 0) > 0;
    const isNamed = mySlot && (Number(state[`beneficiary${beneficiaries.indexOf(mySlot)+1}_percent`] ?? 0) > 0 || (mySlot?.asaAmt ?? 0) > 0);

    if (isActive && mySlot && (hasAlgo || hasAsa)) {
      // Inheritance live — can claim right now
      toast(
        <div style={{ lineHeight:1.7 }}>
          <p style={{ margin:0, fontWeight:700, fontSize:15 }}>Inheritance is ACTIVE!</p>
          <p style={{ margin:"4px 0 8px", fontSize:13 }}>You have unclaimed assets on Will <strong>#{selectedAppId}</strong>:</p>
          {hasAlgo && <p style={{ margin:0, fontSize:12 }}>• ALGO payout (your % share)</p>}
          {hasAsa  && <p style={{ margin:0, fontSize:12 }}>• Token / NFT allocation</p>}
          <button style={{ marginTop:8, fontSize:12, padding:"5px 14px", background:"var(--accent)", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontWeight:600 }}
            onClick={() => setActiveTab("claim")}>
            Claim Now →
          </button>
        </div>,
        { autoClose: false, toastId: key }
      );
    } else if (!isActive && remaining === 0 && Number(state.will_created) === 1 && mySlot) {
      // Timer expired — can activate
      toast.warning(
        <div style={{ lineHeight:1.7 }}>
          <p style={{ margin:0, fontWeight:700 }}>Owner inactive!</p>
          <p style={{ margin:"4px 0 8px", fontSize:13 }}>Will <strong>#{selectedAppId}</strong> can now be activated so you can claim.</p>
          <button style={{ marginTop:4, fontSize:12, padding:"5px 14px", background:"#f59e0b", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontWeight:600 }}
            onClick={() => setActiveTab("claim")}>
            Activate &amp; Claim →
          </button>
        </div>,
        { autoClose: false, toastId: key + "-ready" }
      );
    } else if (!isActive && isNamed) {
      // Owner has set them up — inheritance not yet active, heads up
      toast.info(
        <div style={{ lineHeight:1.7 }}>
          <p style={{ margin:0, fontWeight:700, fontSize:15 }}>You have a pending inheritance!</p>
          <p style={{ margin:"4px 0 8px", fontSize:13 }}>You have been named as a beneficiary in Will <strong>#{selectedAppId}</strong>.</p>
          {(mySlot?.asaAmt ?? 0) > 0 && <p style={{ margin:0, fontSize:12 }}>• Token / NFT has been locked for you</p>}
          <p style={{ margin:0, fontSize:12 }}>• Claims open once the owner misses their check-in</p>
          <button style={{ marginTop:8, fontSize:12, padding:"5px 14px", background:"var(--accent)", border:"none", borderRadius:6, color:"#fff", cursor:"pointer", fontWeight:600 }}
            onClick={() => setActiveTab("claim")}>
            View My Claim →
          </button>
        </div>,
        { autoClose: 12000, toastId: key + "-pending" }
      );
    }
  }, [state, activeAddr, selectedAppId]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const handleWillCreated = useCallback(async (newAppId) => {
    addStoredWillId(activeAddr, newAppId);
    const updated = getStoredWillIds(activeAddr);
    setWillAppIds(updated);
    setSelectedAppId(newAppId);
    setShowCreate(false);
    // Immediately fetch state for the new will so OwnerDashboard appears at once
    setRefreshing(true);
    try {
      const raw = await getAppGlobalState(newAppId);
      setState(raw);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, [activeAddr]);

  const handleRemoveWill = (appId) => {
    if (!window.confirm(`Remove Will #${appId} from your list? (This does not delete the on-chain contract.)`)) return;
    removeStoredWillId(activeAddr, appId);
    const updated = getStoredWillIds(activeAddr);
    setWillAppIds(updated);
    if (selectedAppId === appId) {
      setSelectedAppId(updated[0] ?? null);
      setState(null);
    }
  };

  const willExists = state && Number(state.will_created) === 1;
  const isOwner    = state && activeAddr && state.owner === activeAddr;

  return (
    <div className="app-wrapper">
      {/* ── Animated starfield background ──────────────────── */}
      <StarsBackground
        starDensity={0.00015}
        allStarsTwinkle={true}
        twinkleProbability={0.7}
        minTwinkleSpeed={0.5}
        maxTwinkleSpeed={1}
      />
      <ShootingStars
        minSpeed={10}
        maxSpeed={30}
        minDelay={4200}
        maxDelay={8700}
        starColor="#9E00FF"
        trailColor="#2EB9DF"
        starWidth={10}
        starHeight={1}
      />

      <Navbar />

      <main className="main-content">
        {/* ── Hero ────────────────────────────────────────────── */}
        <div className="hero">
          <h1>On-Chain Inheritance<br />Secured by Algorand</h1>
          <p>
            Lock funds on-chain. Beneficiaries claim automatically if you
            miss your check-in window. Fully trustless, no intermediaries.
          </p>
        </div>

        {/* ── Not connected ────────────────────────────────────── */}
        {!isConnected && (
          <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}></p>
            <h2 style={{ marginBottom: 8 }}>Connect Your Wallet</h2>
            <p className="text-muted">
              Connect your Pera Wallet to create a will or claim an inheritance.
            </p>
          </div>
        )}

        {/* ── Refreshing indicator ─────────────────────────────── */}
        {refreshing && (
          <p className="text-muted" style={{ marginBottom: 12 }}>Refreshing state…</p>
        )}

        {/* ── Tabs + Content ───────────────────────────────────── */}
        {isConnected && (
          <>
            <div className="tabs-bar">
              <button
                className={`tab-btn${activeTab === "will" ? " active" : ""}`}
                onClick={() => switchTab("will")}
              >
                Will
              </button>
              <button
                className={`tab-btn${activeTab === "assets" ? " active" : ""}`}
                onClick={() => switchTab("assets")}
              >
                Digital Assets
              </button>
              <button
                className={`tab-btn${activeTab === "claim" ? " active" : ""}`}
                onClick={() => switchTab("claim")}
              >
                Claim
              </button>
            </div>

            {/* ── Will selector (only for Will + Assets tabs) ────── */}
            {willAppIds.length > 0 && activeTab !== "claim" && (
              <div className="card" style={{ padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", marginRight: 4 }}>
                    Your wills:
                  </span>
                  {willAppIds.map((id) => (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        className={`tab-btn${selectedAppId === id ? " active" : ""}`}
                        style={{ padding: "4px 12px", fontSize: 13, borderBottom: "none", marginBottom: 0 }}
                        onClick={() => { setSelectedAppId(id); setShowCreate(false); }}
                      >
                        #{id}
                      </button>
                      <button
                        title="Remove from list"
                        onClick={() => handleRemoveWill(id)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--text-muted)", fontSize: 11, padding: "2px 4px",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <a
                    className="explorer-link"
                    href={`${EXPLORER_BASE}/application/${selectedAppId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, marginLeft: 4 }}
                  >
                    Explorer ↗
                  </a>
                </div>
              </div>
            )}

            {/* ════════════════════  WILL TAB  ════════════════════ */}
            {activeTab === "will" && (
              <>
                {/* Create New Will button */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 13 }}
                    onClick={() => { setShowCreate((v) => !v); }}
                  >
                    {showCreate ? "\u2715 Cancel" : "+ Create New Will"}
                  </button>
                </div>

                {showCreate && (
                  <CreateWillForm onSuccess={handleWillCreated} />
                )}

                {/* Selected will dashboard */}
                {!showCreate && selectedAppId && (
                  <>
                    {willExists && isOwner && (
                      <OwnerDashboard state={state} appId={selectedAppId} onRefresh={fetchState} />
                    )}
                    {willExists && !isOwner && (
                      <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
                        <p style={{ fontSize: 36, marginBottom: 12 }}></p>
                        <h2 style={{ marginBottom: 8 }}>Will #{selectedAppId}</h2>
                        <p className="text-muted">
                          You are not the owner of this will. Switch to the{" "}
                          <strong>Claim</strong> tab to check your beneficiary status.
                        </p>
                      </div>
                    )}
                    {!willExists && !showCreate && (
                      refreshing
                        ? <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
                            <span className="spinner" style={{ width: 28, height: 28 }} />
                            <p className="text-muted" style={{ marginTop: 16 }}>Loading will…</p>
                          </div>
                        : <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
                            <p style={{ fontSize: 36, marginBottom: 12 }}></p>
                            <p className="text-muted">
                              No will initialised for App #{selectedAppId}.
                            </p>
                          </div>
                    )}
                  </>
                )}

                {/* No wills yet */}
                {!showCreate && willAppIds.length === 0 && (
                  <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
                    <p style={{ fontSize: 40, marginBottom: 12 }}></p>
                    <h2 style={{ marginBottom: 8 }}>No Wills Yet</h2>
                    <p className="text-muted">Click <strong>Create New Will</strong> above to get started.</p>
                  </div>
                )}
              </>
            )}

            {/* ════════════════  DIGITAL ASSETS TAB  ══════════════════ */}
            {activeTab === "assets" && (
              <>
                {!selectedAppId && (
                  <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
                    <p style={{ fontSize: 36, marginBottom: 12 }}></p>
                    <h2 style={{ marginBottom: 8 }}>No Will Selected</h2>
                    <p className="text-muted">
                      Switch to the <strong>Will</strong> tab to create or select a will first.
                    </p>
                  </div>
                )}
                {selectedAppId && !willExists && (
                  <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
                    <p style={{ fontSize: 36, marginBottom: 12 }}></p>
                    <h2 style={{ marginBottom: 8 }}>No Active Will</h2>
                    <p className="text-muted">
                      App #{selectedAppId} has no active will. Create one in the{" "}
                      <strong>Will</strong> tab.
                    </p>
                  </div>
                )}
                {/* Always show DigitalAssetsPanel — Send Tokens & NFT tabs work without a will */}
                {selectedAppId && (
                  <DigitalAssetsPanel state={state} appId={selectedAppId} onRefresh={fetchState} />
                )}
              </>
            )}

            {/* ══════════════════  CLAIM TAB  ═════════════════════ */}
            {activeTab === "claim" && (
              <ClaimsView                key={claimRefreshKey}                willAppIds={willAppIds}
                activeAddr={activeAddr}
                makeSigner={makeSigner}
                onAddWillId={(id) => {
                  addStoredWillId(activeAddr, id);
                  setWillAppIds(getStoredWillIds(activeAddr));
                }}
              />
            )}
          </>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="app-footer">
        AlgoLegacy — Built on Algorand Testnet &nbsp;·&nbsp;
        <a
          href="https://github.com/NONAME-OP/tift/tree/main/algolegacy"
          target="_blank"
          rel="noreferrer"
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
