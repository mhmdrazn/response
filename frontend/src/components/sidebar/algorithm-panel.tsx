"use client";

import { ChevronDown, Play, RotateCcw } from "lucide-react";
import { useState } from "react";

import type { AlgorithmType } from "../../lib/api";
import type { ACSParams, AppMode, VNSParams } from "../../types";

interface AlgorithmPanelProps {
  mode: AppMode;
  isLoading: boolean;
  onRun: () => void;
  onCompare: () => void;
  onReset: () => void;
  hasResult: boolean;
  error: string | null;
  algorithm: AlgorithmType;
  onAlgorithmChange: (a: AlgorithmType) => void;
  acsParams: ACSParams;
  updateACS: <K extends keyof ACSParams>(key: K, value: ACSParams[K]) => void;
  vnsParams: VNSParams;
  updateVNS: <K extends keyof VNSParams>(key: K, value: VNSParams[K]) => void;
}

export function AlgorithmPanel({
  mode,
  isLoading,
  onRun,
  onCompare,
  onReset,
  hasResult,
  error,
  algorithm,
  onAlgorithmChange,
  acsParams,
  updateACS,
  vnsParams,
  updateVNS,
}: AlgorithmPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-manrope)",
          width: "100%",
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.9px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-slate)",
          }}
        >
          Algoritma
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          style={{
            transition: "transform 0.22s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>

      <div
        className="scrollbar-hidden"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: open ? "min(720px, 78vh)" : 0,
          padding: open ? "0 14px 14px" : "0 14px",
          opacity: open ? 1 : 0,
          overflow: open ? "auto" : "hidden",
          transition:
            "max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, padding 0.28s ease",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Algorithm selector */}
        <div
          role="tablist"
          aria-label="Pilih algoritma"
          style={{
            display: "flex",
            gap: 4,
            padding: 6,
            background: "var(--color-periwinkle-wash)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <AlgoTab
            active={algorithm === "acs"}
            onClick={() => onAlgorithmChange("acs")}
            label="Hybrid ACS"
          />
          <AlgoTab
            active={algorithm === "vns"}
            onClick={() => onAlgorithmChange("vns")}
            label="VNS"
          />
        </div>

        {/* Description */}
        <div
          style={{
            padding: "7px 10px",
            background: "var(--color-mist)",
            border: "1px solid var(--color-frost)",
            borderRadius: "var(--radius-md)",
            fontSize: 11,
            color: "var(--color-steel)",
            fontWeight: "var(--font-weight-medium)",
            letterSpacing: "-0.11px",
            lineHeight: 1.4,
          }}
        >
          {algorithm === "acs"
            ? "Hybrid Ant Colony System — konstruksi solusi berbasis feromon + pencarian lokal"
            : "Variable Neighborhood Search — eksplorasi lingkungan sistematik + pencarian lokal"}
        </div>

        {/* Parameters */}
        {mode === "advanced" ? (
          algorithm === "acs" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <NumInput
                label="Iterasi"
                min={1}
                max={500}
                step={1}
                value={acsParams.iterations}
                onChange={(v) => updateACS("iterations", v)}
              />
              <NumInput
                label="Semut"
                min={1}
                max={100}
                step={1}
                value={acsParams.n_ants}
                onChange={(v) => updateACS("n_ants", v)}
              />
              <NumInput
                label="α (feromon)"
                min={0.1}
                max={5}
                step={0.1}
                value={acsParams.alpha}
                onChange={(v) => updateACS("alpha", v)}
              />
              <NumInput
                label="β (heuristik)"
                min={0.1}
                max={10}
                step={0.1}
                value={acsParams.beta}
                onChange={(v) => updateACS("beta", v)}
              />
              <NumInput
                label="ρ (evaporasi)"
                min={0.01}
                max={0.9}
                step={0.01}
                value={acsParams.rho}
                onChange={(v) => updateACS("rho", v)}
              />
              <NumInput
                label="q₀ (eksploitasi)"
                min={0}
                max={1}
                step={0.01}
                value={acsParams.q0}
                onChange={(v) => updateACS("q0", v)}
              />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <NumInput
                label="Iterasi Maks"
                min={1}
                max={1000}
                step={1}
                value={vnsParams.max_iterations}
                onChange={(v) => updateVNS("max_iterations", v)}
              />
              <NumInput
                label="k Maks"
                min={1}
                max={6}
                step={1}
                value={vnsParams.k_max}
                onChange={(v) => updateVNS("k_max", v)}
              />
            </div>
          )
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-steel)",
              fontWeight: "var(--font-weight-medium)",
              lineHeight: 1.5,
            }}
          >
            {algorithm === "acs"
              ? "Menggunakan preset default (60 iterasi · 20 semut · batas 45 detik). Beralih ke mode Analitik untuk mengatur parameter."
              : "Menggunakan preset default (100 iterasi · k_max 3 · batas 45 detik). Beralih ke mode Analitik untuk mengatur parameter."}
          </div>
        )}

        {/* Run / Reset buttons */}
        <div style={{ display: "flex", gap: 8 }}>
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
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: isLoading ? "var(--color-steel)" : "var(--color-indigo-ink)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: "var(--font-weight-bold)",
              cursor: isLoading ? "wait" : "pointer",
              letterSpacing: "-0.13px",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = "var(--color-indigo-hover)";
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.background = "var(--color-indigo-ink)";
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
                Jalankan Optimasi
              </>
            )}
          </button>
          {hasResult ? (
            <button
              type="button"
              onClick={onReset}
              disabled={isLoading}
              title="Reset hasil"
              aria-label="Reset hasil"
              style={{
                width: 40,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-frost)",
                background: "var(--color-pure-white)",
                color: "var(--color-steel)",
                cursor: isLoading ? "wait" : "pointer",
              }}
            >
              <RotateCcw size={15} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        {/* Compare button */}
        <button
          type="button"
          disabled={isLoading}
          onClick={onCompare}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-frost)",
            background: "var(--color-pure-white)",
            color: "var(--color-steel)",
            fontSize: 12,
            fontWeight: "var(--font-weight-medium)",
            cursor: isLoading ? "wait" : "pointer",
            letterSpacing: "-0.12px",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) e.currentTarget.style.background = "var(--color-mist)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-pure-white)";
          }}
        >
          Bandingkan ACS vs VNS
        </button>

        {error ? (
          <div
            style={{
              padding: "8px 10px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              color: "#b91c1c",
              fontWeight: "var(--font-weight-semibold)",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AlgoTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 12px",
        borderRadius: "var(--radius-md)",
        border: "none",
        background: active ? "var(--color-active-wash)" : "transparent",
        color: active ? "var(--color-active-ink)" : "var(--color-slate)",
        boxShadow: active ? "0 1px 2px 0 rgb(0 0 0 / 0.06)" : "none",
        fontSize: 12,
        fontWeight: active ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
        cursor: "pointer",
        letterSpacing: "-0.12px",
        transition: "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-slate)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        style={{
          fontFamily: "var(--font-manrope)",
          fontSize: 13,
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-midnight-ink)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-md)",
          padding: "6px 8px",
          outline: "none",
          background: "var(--color-pure-white)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--color-steel)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--color-frost)";
        }}
      />
    </label>
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
