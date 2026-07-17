"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { SI_PALETTE } from "../../lib/map-constants";

interface SiLegendProps {
  /** true: flow layout inside a dock stack (mobile). false (default):
   *  absolute-positioned floating legend over the map (desktop). */
  inline?: boolean;
  /** Deprecated: the chevron is now always shown. Kept for compatibility. */
  collapsible?: boolean;
  /** Initial open state. */
  defaultOpen?: boolean;
}

export function SiLegend({
  inline = false,
  defaultOpen = false,
}: SiLegendProps) {
  const [open, setOpen] = useState(defaultOpen);

  const positionStyle: React.CSSProperties = inline
    ? { position: "static" }
    : { position: "absolute", bottom: 24, right: 16, zIndex: 800, minWidth: 150 };

  const swatches = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        maxHeight: open ? 240 : 0,
        opacity: open ? 1 : 0,
        overflow: "hidden",
        transition:
          "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, margin-top 0.28s ease, padding-top 0.28s ease",
        marginTop: open ? 4 : 0,
        paddingTop: open ? 6 : 0,
        borderTop: open ? "1px solid var(--color-frost)" : "1px solid transparent",
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

  return (
    <div
      style={{
        ...positionStyle,
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: "8px 12px",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
        <span
          style={{
            fontSize: 9.5,
            textTransform: "uppercase",
            letterSpacing: "0.9px",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-slate)",
          }}
        >
          Severity Index
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
      {swatches}
    </div>
  );
}
