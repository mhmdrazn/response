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
      className={`pointer-events-auto flex flex-col gap-[10px] ${
        embedded
          ? "border-0 bg-transparent p-0"
          : "rounded-lg border border-frost bg-pure-white p-[14px]"
      }`}
    >
      {/* Header — hidden when embedded (the tab already labels the section). */}
      {embedded ? null : (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex cursor-pointer items-center justify-between border-0 bg-transparent p-0"
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.9px] text-slate">
            Severity Index (AHP + EW)
          </span>
          <span
            className={`inline-flex transition-transform duration-200 ${
              expanded ? "rotate-180" : "rotate-0"
            }`}
          >
            <ChevronDown size={14} color="var(--color-slate)" />
          </span>
        </button>
      )}

      {expanded ? (
        <div
          className="flex flex-col gap-[10px]"
          style={{ animation: "response-fade-up 0.24s ease-out" }}
        >
          {/* Weights summary */}
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-[10px] gap-y-[4px] text-[11px] leading-[1.6]">
            <WeightHeader />
            {w.criteria.map((c, i) => (
              <WeightRow key={c} label={c} ahp={w.ahp[i]} ew={w.ew[i]} combined={w.combined[i]} />
            ))}
          </div>

          {/* CR */}
          <div className="flex gap-[4px] text-[11px] text-steel">
            <span>Consistency Ratio:</span>
            <span
              className={`font-bold ${
                w.consistency_ratio <= 0.1 ? "text-si-low" : "text-si-critical"
              }`}
            >
              {w.consistency_ratio.toFixed(4)}
              {w.consistency_ratio <= 0.1 ? " (konsisten)" : " (inkonsisten)"}
            </span>
          </div>

          {/* Divider */}
          <div className="h-px bg-frost" />

          {/* Flood point SI table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
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
        <div className="text-[11px] leading-[1.5] text-steel">
          {severity.flood_points.length} titik genangan dianalisis. CR ={" "}
          {w.consistency_ratio.toFixed(4)}. Klik untuk detail.
        </div>
      )}
    </div>
  );
}

function WeightHeader() {
  const base = "pb-[2px] text-[9px] font-bold uppercase tracking-[0.5px] text-slate";
  return (
    <>
      <span className={base}>Kriteria</span>
      <span className={`${base} text-right`}>AHP</span>
      <span className={`${base} text-right`}>EW</span>
      <span className={`${base} text-right`}>Gabungan</span>
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
  const num = "text-right text-midnight-ink tabular-nums";
  return (
    <>
      <span className="font-medium capitalize text-slate">{label.replace(/_/g, " ")}</span>
      <span className={num}>{ahp.toFixed(4)}</span>
      <span className={num}>{ew.toFixed(4)}</span>
      <span className={`${num} font-bold`}>{combined.toFixed(4)}</span>
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
      className={`cursor-pointer select-none whitespace-nowrap border-b border-frost px-[6px] py-[4px] text-[9px] font-bold uppercase tracking-[0.5px] ${
        align === "right" ? "text-right" : "text-left"
      } ${isActive ? "text-midnight-ink" : "text-slate"}`}
    >
      {label}
      {isActive ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

function FloodRow({ fp }: { fp: SeverityFloodPoint }) {
  const color = siColor(fp.si_value);
  const cellNum = "border-b border-mist px-[6px] py-[3px] text-right text-midnight-ink tabular-nums";
  return (
    <tr>
      <td className="border-b border-mist px-[6px] py-[3px] font-medium text-midnight-ink">
        {fp.id}
      </td>
      <td className="border-b border-mist px-[6px] py-[3px] text-right">
        <span className="inline-flex items-center gap-[4px]">
          <span
            className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="font-bold text-midnight-ink tabular-nums">
            {fp.si_value.toFixed(3)}
          </span>
        </span>
      </td>
      <td className={cellNum}>{fp.depth_cm} cm</td>
      <td className={cellNum}>
        {fp.dist_faskes_m < 1000
          ? `${Math.round(fp.dist_faskes_m)} m`
          : `${(fp.dist_faskes_m / 1000).toFixed(1)} km`}
      </td>
    </tr>
  );
}
