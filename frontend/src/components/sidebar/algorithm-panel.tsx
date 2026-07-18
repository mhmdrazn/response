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
    <div className="pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-8 border-0 bg-transparent px-[14px] py-12 text-left"
      >
        <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
          Algoritma
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`scrollbar-hidden flex flex-col gap-12 transition-[max-height,opacity,padding] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[min(720px,78vh)] overflow-auto px-[14px] pb-[14px] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden px-[14px] py-0 opacity-0"
        }`}
      >
        {/* Algorithm selector */}
        <div
          role="tablist"
          aria-label="Pilih algoritma"
          className="flex gap-[4px] rounded-lg bg-periwinkle-wash p-[6px]"
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
        <div className="rounded-md border border-frost bg-mist px-[10px] py-[7px] text-[11px] font-medium leading-[1.4] tracking-[-0.11px] text-steel">
          {algorithm === "acs"
            ? "Hybrid Ant Colony System — konstruksi solusi berbasis feromon + pencarian lokal"
            : "Variable Neighborhood Search — eksplorasi lingkungan sistematik + pencarian lokal"}
        </div>

        {/* Parameters */}
        {mode === "advanced" ? (
          algorithm === "acs" ? (
            <div className="grid grid-cols-2 gap-8">
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
            <div className="grid grid-cols-2 gap-8">
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
          <div className="text-[12px] font-medium leading-[1.5] text-steel">
            {algorithm === "acs"
              ? "Menggunakan preset default (60 iterasi · 20 semut · batas 45 detik). Beralih ke mode Analitik untuk mengatur parameter."
              : "Menggunakan preset default (100 iterasi · k_max 3 · batas 45 detik). Beralih ke mode Analitik untuk mengatur parameter."}
          </div>
        )}

        {/* Run / Reset buttons */}
        <div className="flex gap-8">
          <button
            type="button"
            disabled={isLoading}
            onClick={onRun}
            className={`inline-flex flex-1 items-center justify-center gap-[6px] rounded-md border-0 px-[14px] py-[10px] text-[13px] font-bold tracking-[-0.13px] text-white transition-colors ${
              isLoading
                ? "cursor-wait bg-steel"
                : "cursor-pointer bg-indigo-ink hover:bg-indigo-hover"
            }`}
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
              className={`inline-flex w-[40px] items-center justify-center rounded-md border border-frost bg-pure-white p-8 text-steel ${
                isLoading ? "cursor-wait" : "cursor-pointer"
              }`}
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
          className={`inline-flex items-center justify-center gap-[6px] rounded-md border border-frost bg-pure-white px-[14px] py-8 text-[12px] font-medium tracking-[-0.12px] text-steel transition-colors hover:bg-mist ${
            isLoading ? "cursor-wait" : "cursor-pointer"
          }`}
        >
          Bandingkan ACS vs VNS
        </button>

        {error ? (
          <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-[10px] py-8 text-[12px] font-semibold leading-[1.4] text-[#b91c1c]">
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
      className={`flex-1 cursor-pointer rounded-md border-0 px-12 py-[6px] text-[12px] tracking-[-0.12px] transition-[background,color,box-shadow] duration-[150ms] ${
        active
          ? "bg-active-wash font-bold text-active-ink shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
          : "bg-transparent font-medium text-slate shadow-none"
      }`}
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
    <label className="flex flex-col gap-[3px]">
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="font-manrope rounded-md border border-frost bg-pure-white px-8 py-[6px] text-[13px] font-semibold text-midnight-ink outline-none focus:border-steel"
      />
    </label>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-[12px] w-[12px] rounded-full border-2 border-white/35 border-t-white"
      style={{ animation: "response-spin 0.8s linear infinite" }}
    />
  );
}
