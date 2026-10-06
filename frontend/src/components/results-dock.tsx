"use client";

import { ChevronDown, FileDown, Pause, Play } from "lucide-react";
import { useState } from "react";

import { exportReport, exportExcel } from "../lib/export-report";
import { Reveal } from "./reveal";
import { BalancePanel } from "./sidebar/balance-panel";
import { ConvergenceChart } from "./sidebar/convergence-chart";
import { PeriodsPanel } from "./sidebar/periods-panel";
import { ResultsPanel } from "./sidebar/results-panel";
import { RouteList } from "./sidebar/route-list";
import { SeverityPanel } from "./sidebar/severity-panel";
import { UnservedPanel } from "./sidebar/unserved-panel";
import type {
  AppMode,
  OptimizationResult,
  RouteOut,
  SeverityIndexResponse,
  Suggestion,
} from "../types";

type DetailsTab = "routes" | "periods" | "unserved" | "balance" | "severity";

interface ResultsDockProps {
  result: OptimizationResult;
  mode: AppMode;
  completedAt?: number | null;
  severity: SeverityIndexResponse | null;
  highlightVehicleId: string | null;
  onHoverRoute: (id: string | null) => void;
  onFocusRoute: (route: RouteOut) => void;
  hiddenVehicleIds?: Set<string>;
  onToggleVehicleVisibility?: (vehicleId: string) => void;
  animating?: boolean;
  onToggleAnimating?: () => void;
  /** Every period of the plan, and which one the map is showing. */
  periods: OptimizationResult[];
  activePeriod: number;
  onSelectPeriod: (index: number) => void;
  onNextPeriod: () => void;
  onRemainingPeriods: () => void;
  isLoading: boolean;
  onSelectFlood: (id: string) => void;
  onApplySuggestion: (s: Suggestion) => string;
}

export function ResultsDock({
  result,
  mode,
  completedAt,
  severity,
  highlightVehicleId,
  onHoverRoute,
  onFocusRoute,
  hiddenVehicleIds,
  onToggleVehicleVisibility,
  animating = false,
  onToggleAnimating,
  periods,
  activePeriod,
  onSelectPeriod,
  onNextPeriod,
  onRemainingPeriods,
  isLoading,
  onSelectFlood,
  onApplySuggestion,
}: ResultsDockProps) {
  const [tab, setTab] = useState<DetailsTab>("routes");
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const hasSeverity = severity != null;
  const activeTab = tab === "severity" && !hasSeverity ? "routes" : tab;
  const openCount = result.unserved.length;

  const showUnserved = () => {
    setDetailsOpen(true);
    setTab("unserved");
  };

  const cardCls = "pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white";
  const headerBtnCls =
    "font-manrope flex w-full flex-shrink-0 cursor-pointer items-center gap-8 border-0 bg-transparent px-[14px] py-12 text-left";
  const headerLabelCls = "flex-1 text-[10px] font-bold uppercase tracking-[0.9px] text-slate";

  return (
    <>
      <div className={`${cardCls} flex-shrink-0`}>
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
          className={headerBtnCls}
        >
          <span className={headerLabelCls}>Ringkasan Hasil</span>
          <ChevronDown
            size={14}
            color="var(--color-slate)"
            className={`transition-transform duration-[220ms] ${
              summaryOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
        </button>
        <div className="soft-row" data-open={summaryOpen} inert={!summaryOpen}>
          <div>
            <div className="flex flex-col gap-[14px] px-[14px] pb-[14px]">
              <ResultsPanel
                result={result}
                mode={mode}
                completedAt={completedAt}
                periodNote={
                  periods.length > 1 ? `Periode ${activePeriod + 1} dari ${periods.length}` : null
                }
                onShowUnserved={showUnserved}
              />

              <div className="flex gap-[6px]">
                <ExportBtn
                  label="PDF"
                  onClick={() => exportReport(result, { completedAt, periods })}
                />
                <ExportBtn
                  label="Excel"
                  onClick={() => exportExcel(result, { completedAt, periods })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardCls} min-h-0 flex-shrink overflow-hidden`}>
        <div className="flex w-full flex-shrink-0 items-center gap-8 px-[14px] py-12">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="font-manrope flex flex-1 cursor-pointer items-center border-0 bg-transparent p-0 text-left"
          >
            <span className={headerLabelCls}>Detail Rute</span>
          </button>

          {onToggleAnimating ? (
            <button
              type="button"
              onClick={onToggleAnimating}
              title={animating ? "Hentikan animasi kendaraan" : "Jalankan animasi kendaraan"}
              className={`inline-flex flex-shrink-0 cursor-pointer items-center gap-[5px] rounded-md border px-8 py-[5px] text-[11px] font-bold tracking-[-0.1px] transition-colors ${
                animating
                  ? "border-transparent bg-[var(--color-indigo-ink)] text-white"
                  : "border-frost bg-pure-white text-steel hover:bg-mist"
              }`}
            >
              {animating ? (
                <Pause size={12} strokeWidth={2.4} />
              ) : (
                <Play size={12} strokeWidth={2.4} />
              )}
              {animating ? "Hentikan" : "Simulasi"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-label={detailsOpen ? "Tutup detail rute" : "Buka detail rute"}
            className="inline-flex flex-shrink-0 cursor-pointer border-0 bg-transparent p-0"
          >
            <ChevronDown
              size={14}
              color="var(--color-slate)"
              className={`transition-transform duration-[220ms] ${
                detailsOpen ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>
        </div>

        {/* Opens and closes by height. The card sizes to its content and only shrinks
            (the list then scrolls) when the column is too short to show it all. */}
        <div className="soft-row min-h-0 flex-shrink" data-open={detailsOpen} inert={!detailsOpen}>
          {/* Padding sits one level in, so it folds away with the rest at zero height. */}
          <div className="flex min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-12 px-[14px] pb-[14px]">
              <div
                role="tablist"
                aria-label="Detail hasil"
                className="scrollbar-hidden bg-periwinkle-wash flex flex-shrink-0 gap-[4px] overflow-x-auto rounded-lg p-[6px]"
              >
                <TabButton
                  label="Rute"
                  active={activeTab === "routes"}
                  onClick={() => setTab("routes")}
                />
                <TabButton
                  label="Periode"
                  badge={periods.length > 1 ? periods.length : undefined}
                  active={activeTab === "periods"}
                  onClick={() => setTab("periods")}
                />
                <TabButton
                  label="Belum tuntas"
                  badge={openCount > 0 ? openCount : undefined}
                  active={activeTab === "unserved"}
                  onClick={() => setTab("unserved")}
                />
                <TabButton
                  label="Beban"
                  title="Keseimbangan beban antar kendaraan dan depo"
                  active={activeTab === "balance"}
                  onClick={() => setTab("balance")}
                />
                {hasSeverity ? (
                  <TabButton
                    label="Severity"
                    title="Severity Index"
                    active={activeTab === "severity"}
                    onClick={() => setTab("severity")}
                  />
                ) : null}
              </div>

              <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto">
                {activeTab === "routes" ? (
                  <>
                    <RouteList
                      routes={result.routes}
                      highlightId={highlightVehicleId}
                      onHoverRoute={onHoverRoute}
                      onFocusRoute={onFocusRoute}
                      hiddenVehicleIds={hiddenVehicleIds}
                      onToggleVehicleVisibility={onToggleVehicleVisibility}
                    />
                    <Reveal open={mode === "advanced"} gap={14}>
                      <div className="flex flex-col gap-[14px]">
                        <div aria-hidden className="bg-frost h-px" />
                        <ConvergenceChart data={result.convergence} />
                      </div>
                    </Reveal>
                  </>
                ) : activeTab === "periods" ? (
                  <PeriodsPanel
                    periods={periods}
                    activePeriod={activePeriod}
                    onSelect={onSelectPeriod}
                    onNext={onNextPeriod}
                    onRemaining={onRemainingPeriods}
                    isLoading={isLoading}
                  />
                ) : activeTab === "unserved" ? (
                  <UnservedPanel
                    result={result}
                    onSelectFlood={onSelectFlood}
                    onApplySuggestion={onApplySuggestion}
                  />
                ) : activeTab === "balance" ? (
                  <BalancePanel result={result} />
                ) : severity ? (
                  <SeverityPanel severity={severity} embedded />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TabButton({
  label,
  active,
  onClick,
  badge,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-md border-0 px-[10px] py-[5px] text-[12px] font-bold tracking-[-0.12px] whitespace-nowrap transition-[background,color,box-shadow] duration-150 ${
        active
          ? "bg-active-wash text-active-ink shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
          : "text-steel bg-transparent shadow-none"
      }`}
    >
      {label}
      {badge !== undefined ? (
        <span className="bg-midnight-ink rounded-full px-[6px] py-px text-[10px] leading-[1.3] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-frost bg-pure-white text-steel hover:bg-mist inline-flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-md border px-[10px] py-8 text-[11px] font-bold tracking-[-0.11px] transition-colors"
    >
      <FileDown size={12} strokeWidth={2.2} />
      {label}
    </button>
  );
}
