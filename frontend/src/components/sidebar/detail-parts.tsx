"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Building blocks shared by every map-detail panel (flood, depot, outlet, clinic). */

interface DetailShellProps {
  label: string;
  closeLabel: string;
  onClose: () => void;
  /** "embedded": a full-width row under the windowed map. */
  variant: "fullscreen" | "embedded";
  /** Leading mark in the header: a dot, an icon. */
  mark: ReactNode;
  title: string;
  /** Pill next to the title. */
  badge?: { label: string; cls: string };
  subtitle: string;
  /** Right side of the header, left of the close button. */
  trailing?: ReactNode;
  children: ReactNode;
}

export function DetailShell({
  label,
  closeLabel,
  onClose,
  variant,
  mark,
  title,
  badge,
  subtitle,
  trailing,
  children,
}: DetailShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      aria-label={label}
      className={`@container pointer-events-auto flex max-h-[min(436px,50vh)] w-full flex-col overflow-hidden bg-pure-white ${
        variant === "embedded" ? "border-t border-frost" : "rounded-lg border border-frost"
      }`}
    >
      <header className="flex flex-shrink-0 items-center gap-[10px] border-b border-frost px-[16px] py-[10px]">
        {mark}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-[2px]">
            <h2 className="m-0 text-[14px] font-bold leading-[1.2] tracking-[-0.15px] text-midnight-ink">
              {title}
            </h2>
            {badge ? (
              <span
                className={`rounded-md px-[8px] py-px text-[10.5px] font-bold tracking-[0.2px] ${badge.cls}`}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
          <p className="m-0 mt-[2px] truncate text-[11.5px] font-medium text-slate">{subtitle}</p>
        </div>
        {trailing}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          title="Tutup (Esc)"
          className="inline-flex h-[28px] w-[28px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-frost bg-pure-white text-steel transition-colors hover:bg-mist"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </header>
      {children}
    </section>
  );
}

/** The two columns under the stats row; stacks below 680px of panel width. */
export function DetailColumns({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto @min-[680px]:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.5fr)] @min-[680px]:divide-x @min-[680px]:divide-frost @min-[680px]:overflow-hidden">
      {children}
    </div>
  );
}

export function DetailStats({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-shrink-0 grid-cols-2 border-b border-frost @min-[600px]:grid-cols-4">
      {children}
    </div>
  );
}

export function DetailStat({
  label,
  value,
  sub,
  progress,
  last = false,
}: {
  label: string;
  value: string;
  sub: string;
  progress?: number | null;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[3px] px-[16px] py-[10px] ${
        last ? "" : "border-r border-frost"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">{label}</span>
      <span className="truncate text-[20px] font-bold leading-[1.1] tracking-[-0.4px] text-midnight-ink tabular-nums">
        {value}
      </span>
      {progress != null ? (
        <span className="block h-[4px] w-full overflow-hidden rounded-full bg-frost">
          <span
            className="soft-grow-x block h-full rounded-full bg-midnight-ink"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}
      <span className="truncate text-[11px] font-medium text-slate">{sub}</span>
    </div>
  );
}

export function DetailSection({
  title,
  children,
  fill = false,
}: {
  title: string;
  children: ReactNode;
  /** The children own a scroll region; the section itself does not scroll. */
  fill?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[8px] px-[16px] py-[10px] @min-[680px]:min-h-0 ${
        fill ? "@min-[680px]:overflow-hidden" : "@min-[680px]:overflow-y-auto"
      }`}
    >
      <h3 className="m-0 flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function DetailFacts({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[14px] gap-y-[6px] text-[12px]">
      {children}
    </dl>
  );
}

export function DetailFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-slate">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right font-bold text-midnight-ink">{value}</dd>
    </>
  );
}

export function DetailNote({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12px] font-medium leading-[1.45] text-slate">{children}</p>;
}

/** Header row of a log table; pass the grid template through `grid`. */
export function LogHead({ grid, children }: { grid: string; children: ReactNode }) {
  return (
    <div
      className={`${grid} flex-shrink-0 border-b border-frost pb-[5px] text-[10px] font-bold uppercase tracking-[0.7px] text-slate`}
    >
      {children}
    </div>
  );
}

export function LogList({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {children}
      {footer}
    </div>
  );
}

export function LogRows({ children }: { children: ReactNode }) {
  return (
    <ul className="scrollbar-hidden m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">{children}</ul>
  );
}

export const LOG_ROW_CLS = "border-b border-frost py-[6px] text-[11.5px] last:border-b-0";

/** Rounded accent square holding an icon, as the header mark of a facility panel. */
export function DetailMark({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-md text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}
