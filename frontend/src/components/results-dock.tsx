"use client";

import { ChevronDown, FileDown } from "lucide-react";
import { useState } from "react";

import { exportReport, exportJSON, exportCSV } from "../lib/export-report";
import { ConvergenceChart } from "./sidebar/convergence-chart";
import { ResultsPanel } from "./sidebar/results-panel";
import { RouteList } from "./sidebar/route-list";
import { SeverityPanel } from "./sidebar/severity-panel";
import type { AppMode, OptimizationResult, RouteOut, SeverityIndexResponse } from "../types";

type DetailsTab = "routes" | "severity";

interface ResultsDockProps {
  result: OptimizationResult;
  mode: AppMode;
  severity: SeverityIndexResponse | null;
  highlightVehicleId: string | null;
  onHoverRoute: (id: string | null) => void;
  onFocusRoute: (route: RouteOut) => void;
  hiddenVehicleIds?: Set<string>;
  onToggleVehicleVisibility?: (vehicleId: string) => void;
}

export function ResultsDock({
  result,
  mode,
  severity,
  highlightVehicleId,
  onHoverRoute,
  onFocusRoute,
  hiddenVehicleIds,
  onToggleVehicleVisibility,
}: ResultsDockProps) {
  const [tab, setTab] = useState<DetailsTab>("routes");
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const hasSeverity = severity != null;
  // Without severity data there's nothing to switch to, so skip the tab bar.
  const activeTab = hasSeverity ? tab : "routes";

  const cardCls =
    "pointer-events-auto flex flex-col rounded-lg border border-frost bg-pure-white";
  const headerBtnCls =
    "font-manrope flex w-full flex-shrink-0 cursor-pointer items-center gap-8 border-0 bg-transparent px-[14px] py-12 text-left";
  const headerLabelCls =
    "flex-1 text-[10px] font-bold uppercase tracking-[0.9px] text-slate";

  return (
    <>
      {/* Summary panel — collapsible header + body */}
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
        <div
          className={`flex flex-col gap-[14px] transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            summaryOpen
              ? "pointer-events-auto max-h-[min(600px,60vh)] overflow-visible px-[14px] pb-[14px] opacity-100"
              : "pointer-events-none max-h-0 overflow-hidden px-[14px] py-0 opacity-0"
          }`}
        >
          <ResultsPanel result={result} mode={mode} />

          {/* Export buttons */}
          <div className="flex gap-[6px]">
            <ExportBtn label="PDF" onClick={() => exportReport(result)} />
            <ExportBtn label="JSON" onClick={() => exportJSON(result)} />
            <ExportBtn label="CSV" onClick={() => exportCSV(result)} />
          </div>
        </div>
      </div>

      {/* Details panel — collapsible header, then tab bar and scrolling body */}
      <div
        className={`${cardCls} min-h-0 overflow-hidden transition-[flex] duration-[280ms] ${
          detailsOpen ? "flex-1" : "flex-none"
        }`}
      >
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className={headerBtnCls}
        >
          <span className={headerLabelCls}>Detail Rute</span>
          <ChevronDown
            size={14}
            color="var(--color-slate)"
            className={`transition-transform duration-[220ms] ${
              detailsOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
        </button>

        <div
          className={`flex min-h-0 flex-col gap-12 overflow-hidden transition-[opacity,padding,flex] duration-[280ms] ${
            detailsOpen
              ? "pointer-events-auto flex-1 px-[14px] pb-[14px] opacity-100"
              : "pointer-events-none flex-none px-[14px] py-0 opacity-0"
          }`}
        >
          {hasSeverity ? (
            <div
              role="tablist"
              aria-label="Detail hasil"
              className="flex flex-shrink-0 gap-[4px] rounded-lg bg-periwinkle-wash p-[6px]"
            >
              <TabButton
                label="Rute"
                active={activeTab === "routes"}
                onClick={() => setTab("routes")}
              />
              <TabButton
                label="Severity Index"
                active={activeTab === "severity"}
                onClick={() => setTab("severity")}
              />
            </div>
          ) : null}

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
                {mode === "advanced" ? (
                  <>
                    <div aria-hidden className="h-px bg-frost" />
                    <ConvergenceChart data={result.convergence} />
                  </>
                ) : null}
              </>
            ) : severity ? (
              <SeverityPanel severity={severity} embedded />
            ) : null}
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 cursor-pointer whitespace-nowrap rounded-md border-0 px-[10px] py-[5px] text-[12px] font-bold tracking-[-0.12px] transition-[background,color,box-shadow] duration-150 ${
        active
          ? "bg-active-wash text-active-ink shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]"
          : "bg-transparent text-steel shadow-none"
      }`}
    >
      {label}
    </button>
  );
}

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-md border border-frost bg-pure-white px-[10px] py-8 text-[11px] font-bold tracking-[-0.11px] text-steel transition-colors hover:bg-mist"
    >
      <FileDown size={12} strokeWidth={2.2} />
      {label}
    </button>
  );
}
