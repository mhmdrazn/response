"use client";

import type { ReactNode } from "react";

import { siColor } from "../../lib/map-constants";

interface PopupShellProps {
  title: string;
  subtitle?: string | null;
  children?: ReactNode;
}

export function PopupShell({ title, subtitle, children }: PopupShellProps) {
  return (
    <div
      style={{
        maxWidth: 248,
        minWidth: 160,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "var(--color-midnight-ink)",
          fontWeight: "var(--font-weight-bold)",
          letterSpacing: "-0.14px",
          lineHeight: 1.25,
          wordBreak: "break-word",
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--color-slate)",
            fontWeight: "var(--font-weight-semibold)",
            letterSpacing: "-0.12px",
            lineHeight: 1.35,
            wordBreak: "break-word",
          }}
        >
          {subtitle}
        </div>
      ) : null}
      {children ? (
        <div
          style={{
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface PopupRowProps {
  label: string;
  value: ReactNode;
}

export function PopupRow({ label, value }: PopupRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12.5,
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: "var(--color-slate)",
          fontWeight: "var(--font-weight-semibold)",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "var(--color-midnight-ink)",
          fontWeight: "var(--font-weight-bold)",
          textAlign: "right",
          wordBreak: "break-word",
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

interface SiPillProps {
  si: number;
  label: string;
}

export function SiPill({ si, label }: SiPillProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "var(--radius-md)",
        padding: "1px 8px",
        fontSize: 11,
        background: siColor(si),
        color: "#ffffff",
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "0.2px",
        whiteSpace: "nowrap",
      }}
    >
      {label} · {si.toFixed(2)}
    </span>
  );
}

interface DescBlockProps {
  text: string | null | undefined;
  max?: number;
}

export function DescBlock({ text, max = 140 }: DescBlockProps) {
  if (!text) return null;
  const clipped = text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
  return (
    <div
      style={{
        marginTop: 4,
        fontSize: 12,
        color: "var(--color-steel)",
        fontWeight: "var(--font-weight-medium)",
        lineHeight: 1.5,
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {clipped}
    </div>
  );
}
