"use client";

import { ModeToggle } from "./mode-toggle";
import type { AppMode } from "../types";

interface FloatingNavbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  compact?: boolean;
}

export function FloatingNavbar({
  mode,
  onModeChange,
  compact = false,
}: FloatingNavbarProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: compact ? 12 : 16,
        left: compact ? 12 : 16,
        right: compact ? 12 : undefined,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: compact ? 8 : 12,
        background: "var(--color-pure-white)",
        border: "1px solid var(--color-frost)",
        borderRadius: "var(--radius-lg)",
        padding: compact ? "6px 10px" : "8px 14px",
        pointerEvents: "auto",
      }}
    >
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: compact ? 8 : 10,
            height: compact ? 8 : 10,
            borderRadius: 999,
            background: "var(--color-indigo-ink)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: compact ? 15 : 17,
            lineHeight: 1,
            color: "var(--color-midnight-ink)",
            fontWeight: "var(--font-weight-bold)",
            letterSpacing: "-0.2px",
          }}
        >
          Response
        </span>
        {!compact ? (
          <span
            style={{
              fontSize: 12,
              lineHeight: 1,
              color: "var(--color-slate)",
              fontWeight: "var(--font-weight-semibold)",
              marginLeft: 8,
              paddingLeft: 10,
              borderLeft: "1px solid var(--color-frost)",
            }}
          >
            SPK Damkar Surabaya
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ width: 1, height: 24, background: "var(--color-frost)", flexShrink: 0 }} />
      <ModeToggle mode={mode} onChange={onModeChange} compact={compact} />
    </div>
  );
}
