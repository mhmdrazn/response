"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { siColor } from "../../lib/map-constants";
import type { SeverityIndexResponse, SeverityFloodPoint } from "../../types";

interface SeverityPanelProps {
  severity: SeverityIndexResponse;
  /** Embedded inside a tab: drop the outer card + collapsible header and
   *  always render the full content (the tab already labels the section). */
  embedded?: boolean;
}

type SortKey = "id" | "si_value" | "depth_cm" | "dist_faskes_m";
type SortDir = "asc" | "desc";

export function SeverityPanel({ severity, embedded = false }: SeverityPanelProps) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = embedded ? true : expandedState;
  const [sortKey, setSortKey] = useState<SortKey>("si_value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const w = severity.weights;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "id" ? "asc" : "desc");
    }
  }

  const sorted = [...severity.flood_points].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = Number(av);
    const bn = Number(bv);
    return sortDir === "asc" ? an - bn : bn - an;
  });

  return (
    <div
      style={{
        ...(embedded
          ? { background: "transparent", border: "none", padding: 0 }
          : {
              background: "var(--color-pure-white)",
              border: "1px solid var(--color-frost)",
              borderRadius: "var(--radius-lg)",
              padding: 14,
            }),
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "auto",
      }}
    >
      {/* Header — hidden when embedded (the tab already labels the section). */}
      {embedded ? null : (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.9px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-slate)",
            }}
          >
            Severity Index (AHP + EW)
          </span>
          <span
            style={{
              display: "inline-flex",
              transition: "transform 0.2s ease",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <ChevronDown size={14} color="var(--color-slate)" />
          </span>
        </button>
      )}

      {expanded ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            animation: "response-fade-up 0.24s ease-out",
          }}
        >
          {/* Weights summary */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr 1fr 1fr",
              gap: "4px 10px",
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            <WeightHeader />
            {w.criteria.map((c, i) => (
              <WeightRow
                key={c}
                label={c}
                ahp={w.ahp[i]}
                ew={w.ew[i]}
                combined={w.combined[i]}
              />
            ))}
          </div>

          {/* CR */}
          <div
            style={{
              fontSize: 11,
              color: "var(--color-steel)",
              display: "flex",
              gap: 4,
            }}
          >
            <span>Consistency Ratio:</span>
            <span
              style={{
                fontWeight: "var(--font-weight-bold)",
                color: w.consistency_ratio <= 0.1
                  ? "var(--color-si-low)"
                  : "var(--color-si-critical)",
              }}
            >
              {w.consistency_ratio.toFixed(4)}
              {w.consistency_ratio <= 0.1 ? " (konsisten)" : " (inkonsisten)"}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--color-frost)" }} />

          {/* Flood point SI table */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead>
                <tr>
                  <SortTh
                    label="ID"
                    sortKey="id"
                    active={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <SortTh
                    label="SI"
                    sortKey="si_value"
                    active={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortTh
                    label="Kedalaman"
                    sortKey="depth_cm"
                    active={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                  <SortTh
                    label="Jarak Faskes"
                    sortKey="dist_faskes_m"
                    active={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map((fp) => (
                  <FloodRow key={fp.id} fp={fp} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-steel)",
            lineHeight: 1.5,
          }}
        >
          {severity.flood_points.length} titik genangan dianalisis.
          CR = {w.consistency_ratio.toFixed(4)}.
          Klik untuk detail.
        </div>
      )}
    </div>
  );
}

function WeightHeader() {
  const s: React.CSSProperties = {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: "var(--font-weight-bold)",
    color: "var(--color-slate)",
    paddingBottom: 2,
  };
  return (
    <>
      <span style={s}>Kriteria</span>
      <span style={{ ...s, textAlign: "right" }}>AHP</span>
      <span style={{ ...s, textAlign: "right" }}>EW</span>
      <span style={{ ...s, textAlign: "right" }}>Gabungan</span>
    </>
  );
}

function WeightRow({
  label,
  ahp,
  ew,
  combined,
}: {
  label: string;
  ahp: number;
  ew: number;
  combined: number;
}) {
  const numStyle: React.CSSProperties = {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: "var(--color-midnight-ink)",
  };
  return (
    <>
      <span
        style={{
          color: "var(--color-slate)",
          fontWeight: "var(--font-weight-medium)",
          textTransform: "capitalize",
        }}
      >
        {label.replace(/_/g, " ")}
      </span>
      <span style={numStyle}>{ahp.toFixed(4)}</span>
      <span style={numStyle}>{ew.toFixed(4)}</span>
      <span style={{ ...numStyle, fontWeight: "var(--font-weight-bold)" }}>
        {combined.toFixed(4)}
      </span>
    </>
  );
}

function SortTh({
  label,
  sortKey,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        textAlign: align,
        padding: "4px 6px",
        cursor: "pointer",
        fontWeight: "var(--font-weight-bold)",
        color: isActive ? "var(--color-midnight-ink)" : "var(--color-slate)",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        borderBottom: "1px solid var(--color-frost)",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {label}
      {isActive ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

function FloodRow({ fp }: { fp: SeverityFloodPoint }) {
  const color = siColor(fp.si_value);
  return (
    <tr>
      <td
        style={{
          padding: "3px 6px",
          color: "var(--color-midnight-ink)",
          fontWeight: "var(--font-weight-medium)",
          borderBottom: "1px solid var(--color-mist)",
        }}
      >
        {fp.id}
      </td>
      <td
        style={{
          padding: "3px 6px",
          textAlign: "right",
          borderBottom: "1px solid var(--color-mist)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-midnight-ink)",
            }}
          >
            {fp.si_value.toFixed(3)}
          </span>
        </span>
      </td>
      <td
        style={{
          padding: "3px 6px",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: "var(--color-midnight-ink)",
          borderBottom: "1px solid var(--color-mist)",
        }}
      >
        {fp.depth_cm} cm
      </td>
      <td
        style={{
          padding: "3px 6px",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: "var(--color-midnight-ink)",
          borderBottom: "1px solid var(--color-mist)",
        }}
      >
        {fp.dist_faskes_m < 1000
          ? `${Math.round(fp.dist_faskes_m)} m`
          : `${(fp.dist_faskes_m / 1000).toFixed(1)} km`}
      </td>
    </tr>
  );
}
