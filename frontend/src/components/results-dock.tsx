"use client";

import { ChevronDown, FileDown } from "lucide-react";
import { useState } from "react";

import { exportReport, exportJSON, exportCSV } from "../lib/export-report";
import { ConvergenceChart } from "./sidebar/convergence-chart";
import { ResultsPanel } from "./sidebar/results-panel";
import { RouteList } from "./sidebar/route-list";
import { SeverityPanel } from "./sidebar/severity-panel";
import type {
  AppMode,
  OptimizationResult,
  RouteOut,
  SeverityIndexResponse,
} from "../types";

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

  return (
    <>
      {/* Summary panel — collapsible header + body */}
      <div
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
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
            Ringkasan Hasil
          </span>
          <ChevronDown
            size={14}
            color="var(--color-slate)"
            style={{
              transition: "transform 0.22s ease",
              transform: summaryOpen ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        </button>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxHeight: summaryOpen ? "min(600px, 60vh)" : 0,
            padding: summaryOpen ? "0 14px 14px" : "0 14px",
            opacity: summaryOpen ? 1 : 0,
            overflow: summaryOpen ? "visible" : "hidden",
            transition:
              "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, padding 0.28s ease",
            pointerEvents: summaryOpen ? "auto" : "none",
          }}
        >
          <ResultsPanel result={result} mode={mode} />

          {/* Export buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <ExportBtn label="PDF" onClick={() => exportReport(result)} />
            <ExportBtn label="JSON" onClick={() => exportJSON(result)} />
            <ExportBtn label="CSV" onClick={() => exportCSV(result)} />
          </div>
        </div>
      </div>

      {/* Details panel — collapsible header, then tab bar and scrolling body */}
      <div
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          flexDirection: "column",
          flex: detailsOpen ? 1 : "0 0 auto",
          minHeight: 0,
          overflow: "hidden",
          pointerEvents: "auto",
          transition: "flex 0.28s ease",
        }}
      >
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
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
            flexShrink: 0,
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
            Detail Rute
          </span>
          <ChevronDown
            size={14}
            color="var(--color-slate)"
            style={{
              transition: "transform 0.22s ease",
              transform: detailsOpen ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        </button>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: detailsOpen ? "0 14px 14px" : "0 14px",
            flex: detailsOpen ? 1 : "0 0 0",
            minHeight: 0,
            opacity: detailsOpen ? 1 : 0,
            overflow: "hidden",
            transition:
              "opacity 0.2s ease, padding 0.28s ease, flex 0.28s ease",
            pointerEvents: detailsOpen ? "auto" : "none",
          }}
        >
          {hasSeverity ? (
            <div
              role="tablist"
              aria-label="Detail hasil"
              style={{
                display: "flex",
                gap: 4,
                padding: 4,
                background: "var(--color-periwinkle-wash)",
                borderRadius: "var(--radius-lg)",
                flexShrink: 0,
              }}
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

          <div
            className="scrollbar-hidden"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
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
                    <div
                      aria-hidden
                      style={{ height: 1, background: "var(--color-frost)" }}
                    />
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
      style={{
        flex: 1,
        padding: "5px 10px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "-0.12px",
        background: active
          ? "var(--color-active-wash)"
          : "transparent",
        color: active
          ? "var(--color-active-ink)"
          : "var(--color-steel)",
        border: "none",
        boxShadow: active ? "0 1px 2px 0 rgb(0 0 0 / 0.06)" : "none",
        transition: "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
        whiteSpace: "nowrap",
      }}
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
      style={{
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "8px 10px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-frost)",
        background: "var(--color-pure-white)",
        color: "var(--color-steel)",
        fontSize: 11,
        fontWeight: "var(--font-weight-bold)",
        cursor: "pointer",
        letterSpacing: "-0.11px",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-mist)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--color-pure-white)";
      }}
    >
      <FileDown size={12} strokeWidth={2.2} />
      {label}
    </button>
  );
}
