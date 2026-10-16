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

/** Closing line of a hover tooltip whose marker opens a detail panel on click. */
export function ClickHint() {
  return <div className="text-[10.5px] font-medium text-slate">Klik untuk detail lengkap</div>;
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

interface PopupActionProps {
  /** Whether the facility is out of service now. */
  closed: boolean;
  closeLabel: string;
  openLabel: string;
  /** One line under the button saying what the change does. */
  note: string;
  onToggle: () => void;
}

/** The tooltip's switch for taking a facility out of the next run, or back in. */
export function PopupAction({ closed, closeLabel, openLabel, note, onToggle }: PopupActionProps) {
  return (
    <div className="flex flex-col gap-[4px] border-t border-frost pt-[8px]">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex w-full cursor-pointer items-center justify-center rounded-md border px-[10px] py-[6px] text-[12px] font-bold tracking-[-0.1px] transition-colors ${
          closed
            ? "border-frost bg-pure-white text-midnight-ink hover:bg-mist"
            : "border-transparent bg-[var(--color-indigo-ink)] text-white hover:bg-[var(--color-indigo-hover)]"
        }`}
      >
        {closed ? openLabel : closeLabel}
      </button>
      <span className="text-[10.5px] font-medium leading-[1.4] text-slate">{note}</span>
    </div>
  );
}

/** "Nonaktif" / "Ditutup" tag beside a tooltip title. */
export function ClosedTag({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit items-center rounded-md bg-[var(--color-indigo-ink)] px-[6px] py-px text-[10.5px] font-bold text-white">
      {label}
    </span>
  );
}
