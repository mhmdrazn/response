"use client";

import { useEffect, useState } from "react";

interface SplashScreenProps {
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function SplashScreen({ onDismiss, autoDismissMs = 3200 }: SplashScreenProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeAt = Math.max(autoDismissMs - 600, 300);
    const fadeTimer = setTimeout(() => setFading(true), fadeAt);
    const dismissTimer = setTimeout(onDismiss, autoDismissMs);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [autoDismissMs, onDismiss]);

  function handleSkip() {
    setFading(true);
    setTimeout(onDismiss, 400);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSkip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleSkip();
      }}
      aria-label="Lewati splash screen"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-pure-white transition-opacity duration-500 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <RoutingAnimation />

      <h1 className="response-splash-title mt-10 text-[56px] font-light leading-none tracking-[-1.4px] text-midnight-ink">
        Response
      </h1>

      <p className="response-splash-subtitle mt-4 max-w-lg px-6 text-center text-[16px] font-medium leading-[1.45] tracking-[-0.16px] text-steel">
        Sistem Pendukung Keputusan Optimasi Rute Armada Pemadam Kebakaran
        <br />
        untuk Penanganan Banjir Kota Surabaya
      </p>

      <p className="response-splash-hint mt-10 text-[12px] font-semibold uppercase tracking-[1.5px] text-smoke">
        Klik untuk lanjut
      </p>
    </div>
  );
}

function RoutingAnimation() {
  return (
    <svg
      viewBox="0 0 480 240"
      width="380"
      height="190"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Animasi optimasi rute dari depo menuju titik-titik genangan"
    >
      <defs>
        <pattern id="response-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--color-frost)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="480" height="240" fill="url(#response-grid)" opacity="0.55" />

      {/* Route polyline — depot → critical → high → elevated → moderate → low → depot */}
      <polyline
        className="response-route-path"
        points="60,190 150,80 230,140 310,60 380,130 430,195 60,190"
        fill="none"
        stroke="var(--color-indigo-ink)"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Depot chip */}
      <g transform="translate(52 182)">
        <rect width="16" height="16" rx="3" fill="var(--color-indigo-ink)" />
        <path
          d="M 8 3.5 C 6 6 4.5 7 4.5 9 A 3.5 3.5 0 0 0 11.5 9 C 11.5 7 10 6 8 3.5 Z"
          fill="var(--color-pure-white)"
        />
      </g>

      {/* Flood point circles, sequenced fade-in matching route draw */}
      <g>
        <circle
          className="response-node critical"
          cx="150"
          cy="80"
          r="9"
          fill="#ef4444"
          stroke="var(--color-pure-white)"
          strokeWidth="2"
        />
        <circle
          className="response-node high"
          cx="230"
          cy="140"
          r="9"
          fill="#f97316"
          stroke="var(--color-pure-white)"
          strokeWidth="2"
        />
        <circle
          className="response-node elevated"
          cx="310"
          cy="60"
          r="9"
          fill="#eab308"
          stroke="var(--color-pure-white)"
          strokeWidth="2"
        />
        <circle
          className="response-node moderate"
          cx="380"
          cy="130"
          r="9"
          fill="#84cc16"
          stroke="var(--color-pure-white)"
          strokeWidth="2"
        />
        <circle
          className="response-node low"
          cx="430"
          cy="195"
          r="9"
          fill="#22c55e"
          stroke="var(--color-pure-white)"
          strokeWidth="2"
        />
      </g>

      {/* Persistent critical pulse to signal priority */}
      <circle
        className="response-node-pulse"
        cx="150"
        cy="80"
        r="4"
        fill="var(--color-pure-white)"
        opacity="0.9"
      />
    </svg>
  );
}
