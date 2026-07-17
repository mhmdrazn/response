"use client";

import { Play, Settings2 } from "lucide-react";

import type { AlgorithmType } from "../lib/api";

interface MobileRunBarProps {
  algorithm: AlgorithmType;
  onAlgorithmChange: (a: AlgorithmType) => void;
  isLoading: boolean;
  onRun: () => void;
  onOpenSettings: () => void;
}

/** Always-visible run bar — optimization can be triggered directly from the
 *  map screen, without first opening a settings dock. */
export function MobileRunBar({
  algorithm,
  onAlgorithmChange,
  isLoading,
  onRun,
  onOpenSettings,
}: MobileRunBarProps) {
  return (
    <div
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 2,
          background: "var(--color-mist)",
          borderRadius: "var(--radius-lg)",
          padding: 3,
          flexShrink: 0,
        }}
      >
        <MiniTab
          active={algorithm === "acs"}
          label="ACS"
          onClick={() => onAlgorithmChange("acs")}
        />
        <MiniTab
          active={algorithm === "vns"}
          label="VNS"
          onClick={() => onAlgorithmChange("vns")}
        />
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={onRun}
        style={{
          flex: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "10px 12px",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: isLoading ? "var(--color-steel)" : "var(--color-indigo-ink)",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: "var(--font-weight-bold)",
          cursor: isLoading ? "wait" : "pointer",
          letterSpacing: "-0.13px",
          minWidth: 0,
          transition: "background 0.15s ease",
        }}
      >
        {isLoading ? (
          <>
            <Spinner />
            Menghitung...
          </>
        ) : (
          <>
            <Play size={14} strokeWidth={2.5} />
            Jalankan
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Pengaturan algoritma"
        title="Pengaturan lanjutan"
        style={{
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-frost)",
          background: "var(--color-pure-white)",
          color: "var(--color-steel)",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-mist)";
          e.currentTarget.style.borderColor = "var(--color-smoke)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-pure-white)";
          e.currentTarget.style.borderColor = "var(--color-frost)";
        }}
      >
        <Settings2 size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function MiniTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 9px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: "var(--font-weight-bold)",
        background: active
          ? "var(--color-active-wash)"
          : "transparent",
        color: active
          ? "var(--color-active-ink)"
          : "var(--color-steel)",
        border: active
          ? "1px solid var(--color-active-border)"
          : "1px solid transparent",
        whiteSpace: "nowrap",
        transition:
          "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid rgba(255,255,255,0.35)",
        borderTopColor: "#ffffff",
        borderRadius: "50%",
        animation: "response-spin 0.8s linear infinite",
      }}
    />
  );
}
