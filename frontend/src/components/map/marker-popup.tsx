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
    <div className="flex min-w-[180px] max-w-[260px] flex-col gap-[6px]">
      <div className="flex flex-col gap-[2px]">
        <div className="break-words text-[13.5px] font-bold leading-[1.3] tracking-[-0.15px] text-midnight-ink">
          {title}
        </div>
        {subtitle ? (
          <div className="break-words text-[11.5px] font-medium leading-[1.4] tracking-[-0.1px] text-slate">
            {subtitle}
          </div>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-col gap-[4px] border-t border-frost pt-[6px]">{children}</div>
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
    <div className="flex min-w-0 items-center justify-between gap-12 text-[12.5px]">
      <span className="flex-shrink-0 font-semibold text-slate">{label}</span>
      <span className="min-w-0 break-words text-right font-bold text-midnight-ink">{value}</span>
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
      className="inline-flex items-center whitespace-nowrap rounded-md px-8 py-px text-[11px] font-bold tracking-[0.2px] text-white"
      style={{ background: siColor(si) }}
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
    <div className="mt-[4px] break-words text-[12px] font-medium leading-[1.5] text-steel [overflow-wrap:anywhere]">
      {clipped}
    </div>
  );
}
