// ─────────────────────────────────────────────────────────────────────────────
// CountdownTimer.js — Live countdown to inheritance activation
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";

export default function CountdownTimer({ secondsRemaining }) {
  const [sec, setSec] = useState(secondsRemaining);

  useEffect(() => {
    setSec(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (sec <= 0) return;
    const t = setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [sec]);

  const days    = Math.floor(sec / 86400);
  const hours   = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const pad = (n) => String(n).padStart(2, "0");

  if (sec <= 0) {
    return (
      <div className="alert alert-danger" style={{ textAlign: "center", fontWeight: 700 }}>
        ⚠️ Inactivity period elapsed — inheritance can be activated!
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted" style={{ marginBottom: 12 }}>
        Time until inheritance activates
      </p>
      <div className="countdown-grid">
        {[["days", days], ["hours", hours], ["mins", minutes], ["secs", seconds]].map(
          ([label, val]) => (
            <div className="countdown-unit" key={label}>
              <div className="countdown-value">{pad(val)}</div>
              <div className="countdown-label">{label}</div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
