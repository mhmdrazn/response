"use client";

import { FileDown } from "lucide-react";
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
}

export function ResultsDock({
  result,
  mode,
  severity,
  highlightVehicleId,
  onHoverRoute,
  onFocusRoute,
}: ResultsDockProps) {
  const [tab, setTab] = useState<DetailsTab>("routes");
  const hasSeverity = severity != null;
  // Without severity data there's nothing to switch to, so skip the tab bar.
  const activeTab = hasSeverity ? tab : "routes";

  return (
    <>
      {/* Summary panel — pinned (does not scroll) */}
      <div
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-lg)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flexShrink: 0,
          pointerEvents: "auto",
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

      {/* Details panel — tab bar pinned, tab content scrolls */}
      <div
        style={{
          background: "var(--color-pure-white)",
          border: "1px solid var(--color-frost)",
          borderRadius: "var(--radius-lg)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          pointerEvents: "auto",
        }}
      >
        {hasSeverity ? (
          <div
            role="tablist"
            aria-label="Detail hasil"
            style={{
              display: "flex",
              gap: 2,
              padding: 3,
              background: "var(--color-mist)",
              border: "1px solid var(--color-frost)",
              borderRadius: 999,
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
        padding: "6px 10px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "-0.12px",
        background: active ? "var(--color-indigo-ink)" : "transparent",
        color: active ? "#ffffff" : "var(--color-steel)",
        transition: "background 0.15s ease, color 0.15s ease",
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
        border: "1px solid var(--color-lavender-border)",
        background: "var(--color-pure-white)",
        color: "var(--color-indigo-ink)",
        fontSize: 11,
        fontWeight: "var(--font-weight-bold)",
        cursor: "pointer",
        letterSpacing: "-0.11px",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-periwinkle-wash)";
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
