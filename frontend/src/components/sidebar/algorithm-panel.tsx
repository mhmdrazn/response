"use client";

import { ChevronDown, Play, RotateCcw } from "lucide-react";
import { useState } from "react";

import type { AlgorithmType } from "../../lib/api";
import type { OptimizationStage } from "../../hooks/use-optimization";
import type { ACSParams, AppMode, ScenarioMeta, VNSParams } from "../../types";
import { ScenarioSelect } from "../scenario-select";
import { ComputationBudgetSelect, type ComputationBudget } from "./computation-budget";

interface AlgorithmPanelProps {
  mode: AppMode;
  isLoading: boolean;
  elapsedSeconds: number;
  progress: number;
  stage: OptimizationStage;
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
  scenarios: ScenarioMeta[];
  scenario: string | undefined;
  onScenarioChange: (id: string) => void;
  budgetS: ComputationBudget;
  onBudgetChange: (value: ComputationBudget) => void;
}

export function AlgorithmPanel({
  mode,
  isLoading,
  elapsedSeconds,
  progress,
  stage,
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
  scenarios,
  scenario,
  onScenarioChange,
  budgetS,
  onBudgetChange,
}: AlgorithmPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-frost bg-pure-white pointer-events-auto flex max-h-full min-h-0 flex-col rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-manrope flex w-full cursor-pointer items-center gap-8 border-0 bg-transparent px-[14px] py-12 text-left"
      >
        <span className="text-slate flex-1 text-[10px] font-bold tracking-[0.9px] uppercase">
          Algoritma
        </span>
        <ChevronDown
          size={14}
          color="var(--color-slate)"
          className={`transition-transform duration-[220ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`flex min-h-0 flex-col transition-[max-height,opacity] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open
            ? "pointer-events-auto max-h-[min(780px,88vh)] opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-12 overflow-y-auto px-[14px] pb-[12px]">
          <div
            role="tablist"
            aria-label="Pilih algoritma"
            className="bg-periwinkle-wash flex gap-[4px] rounded-lg p-[6px]"
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
          ) : null}

          <ScenarioSelect scenarios={scenarios} value={scenario} onChange={onScenarioChange} />

          <ComputationBudgetSelect value={budgetS} onChange={onBudgetChange} disabled={isLoading} />

        </div>

        {/* Pinned: the run controls stay in view however much the form scrolls. */}
        <div className="border-frost flex flex-shrink-0 flex-col gap-8 border-t px-[14px] pt-[12px] pb-[14px]">
          <div className="flex gap-8">
            <button
              type="button"
              disabled={isLoading}
              onClick={onRun}
              className={`inline-flex flex-1 items-center justify-center gap-[6px] rounded-md border-0 px-[14px] py-[10px] text-[13px] font-bold tracking-[-0.13px] text-white transition-colors ${
                isLoading
                  ? "bg-steel cursor-wait"
                  : "bg-indigo-ink hover:bg-indigo-hover cursor-pointer"
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
                className={`border-frost bg-pure-white text-steel inline-flex w-[40px] items-center justify-center rounded-md border p-8 ${
                  isLoading ? "cursor-wait" : "cursor-pointer"
                }`}
              >
                <RotateCcw size={15} strokeWidth={2} />
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-[5px]" aria-live="polite">
              <div className="flex items-center justify-between text-[11px] font-semibold text-steel">
                <span>{stage === "vns" ? "Menjalankan VNS" : "Menjalankan ACS"}</span>
                <span>{elapsedSeconds.toFixed(1)} detik</span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-frost">
                <div
                  className="h-full rounded-full bg-indigo-ink transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={isLoading}
            onClick={onCompare}
            className={`border-frost bg-pure-white text-steel hover:bg-mist inline-flex items-center justify-center gap-[6px] rounded-md border px-[14px] py-8 text-[12px] font-medium tracking-[-0.12px] transition-colors ${
              isLoading ? "cursor-wait" : "cursor-pointer"
            }`}
          >
            Bandingkan ACS Vs VNS
          </button>

          {error ? (
            <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-[10px] py-8 text-[12px] leading-[1.4] font-semibold text-[#b91c1c]">
              {error}
            </div>
          ) : null}
        </div>
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
          ? "bg-active-wash text-active-ink font-bold shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
          : "text-slate bg-transparent font-medium shadow-none"
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
      <span className="text-slate text-[10px] font-bold tracking-[0.5px] uppercase">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="font-manrope border-frost bg-pure-white text-midnight-ink focus:border-steel rounded-md border px-8 py-[6px] text-[13px] font-semibold outline-none"
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
