"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { SI_PALETTE } from "../../lib/map-constants";

interface SiLegendProps {
  /** true: flow layout inside a dock stack (mobile). false (default):
   *  absolute-positioned floating legend over the map (desktop). */
  inline?: boolean;
  /** Render a header toggle so the legend body can collapse — used inline
   *  on mobile to save vertical space in the bottom dock stack. */
  collapsible?: boolean;
  /** Initial open state when collapsible. */
  defaultOpen?: boolean;
}

export function SiLegend({
  inline = false,
  collapsible = false,
  defaultOpen = false,
}: SiLegendProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyOpen = collapsible ? open : true;

  const positionStyle: React.CSSProperties = inline
    ? { position: "static" }
    : { position: "absolute", bottom: 24, right: 16, zIndex: 800, minWidth: 130 };

  const swatches = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        maxHeight: bodyOpen ? 220 : 0,
        opacity: bodyOpen ? 1 : 0,
        overflow: "hidden",
        transition:
          "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
        marginTop: collapsible && bodyOpen ? 4 : 0,
      }}
    >
      {SI_PALETTE.map((bucket) => (
        <div
          key={bucket.labelId}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: bucket.hex,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "var(--color-midnight-ink)",
              fontWeight: "var(--font-weight-medium)",
              letterSpacing: "-0.11px",
            }}
          >
            {bucket.labelId}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--color-steel)",
              marginLeft: "auto",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ≤ {bucket.max.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );

  const headerLabel = (
    <div
      style={{
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.8px",
        fontWeight: "var(--font-weight-bold)",
        color: "var(--color-slate)",
      }}
    >
      Severity Index
    </div>
  );

  return (
    <div
      style={{
        ...positionStyle,
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: "10px 12px",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            width: "100%",
          }}
        >
          {headerLabel}
          {open ? (
            <ChevronDown size={14} color="var(--color-slate)" />
          ) : (
            <ChevronUp size={14} color="var(--color-slate)" />
          )}
        </button>
      ) : (
        <div style={{ marginBottom: 2 }}>{headerLabel}</div>
      )}
      {swatches}
    </div>
  );
}
