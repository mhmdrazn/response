"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { useViewportSize } from "../../hooks/use-viewport-size";

import type { DatasetKey } from "../data-table-modal";
import type { BaseMapId, OverlayLayerId } from "../../lib/map-constants";
import { DataDock } from "./data-dock";
import { MapLayerDock } from "./map-layer-dock";

interface LeftPanelProps {
  floodCount: number;
  depotCount: number;
  ifCount: number;
  faskesCount: number;
  overlays: Record<OverlayLayerId, boolean>;
  setOverlay: (id: OverlayLayerId, visible: boolean) => void;
  baseMap: BaseMapId;
  setBaseMap: (id: BaseMapId) => void;
  onPreviewData: (key: DatasetKey) => void;
  onReloadData?: () => void;
  reloadingData?: boolean;
  scenario?: string;
  /** Docked under the data dock. */
  extraDock?: ReactNode;
  /** Hidden state for the hide-all-panels animation. */
  hidden?: boolean;
  /** Same width as the algorithm panel above, so the column is one straight edge. */
  width?: number;
  /** Height the algorithm panel above keeps for itself (it changes as it folds). */
  reserve?: number;
  /** A dock the user opened does not fit beside the open algorithm panel: fold it. */
  onNeedRoom?: () => void;
}

type DockId = "layers" | "data" | "manage";
/** What the stack sets on each dock, the one passed in as `extraDock` included. */
interface DockControl {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
const DOCKS: DockId[] = ["layers", "data", "manage"];
/** Space between docks (gap-8). */
const DOCK_GAP = 8;
/** A closed dock: just its header. Measured once one is closed. */
const HEADER_H = 42;
/** Open heights to plan with until a dock has been seen open. */
const OPEN_GUESS: Record<DockId, number> = { layers: 250, data: 120, manage: 270 };

/** Height of the stack with the given docks open. */
function stackHeight(
  open: Record<DockId, boolean>,
  openH: Record<DockId, number>,
  headerH: number,
): number {
  return DOCKS.reduce(
    (sum, id, i) => sum + (open[id] ? openH[id] : headerH) + (i > 0 ? DOCK_GAP : 0),
    0,
  );
}

/**
 * Which docks are open, so the stack fits under the algorithm panel without
 * scrolling. The dock the user just opened (`forced`) always opens; the others
 * they want open follow from the most recently opened one down, as long as they
 * fit. The rest stay closed (header only) and open by themselves again once the
 * space is back.
 */
function fitDocks(
  wanted: Record<DockId, boolean>,
  recency: DockId[],
  forced: DockId | null,
  openH: Record<DockId, number>,
  headerH: number,
  room: number,
): Record<DockId, boolean> {
  const open: Record<DockId, boolean> = { layers: false, data: false, manage: false };
  if (forced && wanted[forced]) open[forced] = true;
  for (const id of recency) {
    if (!wanted[id] || open[id]) continue;
    const trial = { ...open, [id]: true };
    if (stackHeight(trial, openH, headerH) <= room) open[id] = true;
  }
  return open;
}

export function LeftPanel({
  floodCount,
  depotCount,
  ifCount,
  faskesCount,
  overlays,
  setOverlay,
  baseMap,
  setBaseMap,
  onPreviewData,
  onReloadData,
  reloadingData,
  scenario,
  extraDock,
  hidden = false,
  width = 340,
  reserve = 400,
  onNeedRoom,
}: LeftPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewport = useViewportSize();
  // What the user asked for, and in which order they opened things.
  const [wanted, setWanted] = useState<Record<DockId, boolean>>({
    layers: true,
    data: true,
    manage: true,
  });
  const [recency, setRecency] = useState<DockId[]>(["layers", "data", "manage"]);
  const [openH, setOpenH] = useState<Record<DockId, number>>(OPEN_GUESS);
  const [headerH, setHeaderH] = useState(HEADER_H);
  // The room below the algorithm panel: 84 px top, 24 px gap, 16 px bottom.
  const room = Math.max(0, viewport.h - 124 - reserve);
  // The dock the user opened last, kept open even when it squeezes the others.
  // Opening the algorithm panel again (its reserve grows) hands the room back.
  const [forced, setForced] = useState<DockId | null>(null);
  const [lastReserve, setLastReserve] = useState(reserve);
  if (reserve !== lastReserve) {
    setLastReserve(reserve);
    if (reserve > lastReserve) setForced(null);
  }
  const open = fitDocks(wanted, recency, forced, openH, headerH, room);
  const overflowing = forced !== null && stackHeight(open, openH, headerH) > room;
  // A dock the user opened does not fit beside the open algorithm panel: ask for
  // the panel to fold, which frees the room it kept.
  useEffect(() => {
    if (overflowing) onNeedRoom?.();
  }, [overflowing, onNeedRoom]);

  const setDock = (id: DockId) => (next: boolean) => {
    setWanted((w) => ({ ...w, [id]: next }));
    if (next) {
      setRecency((r) => [id, ...r.filter((x) => x !== id)]);
      setForced(id);
      // Will not fit beside the open algorithm panel: fold it in the same
      // update, so both move together instead of one after the other.
      const alone = { layers: false, data: false, manage: false, [id]: true };
      if (stackHeight(alone, openH, headerH) > room) onNeedRoom?.();
    } else if (forced === id) {
      setForced(null);
    }
  };

  // Each dock's natural heights, read from its parts rather than from the
  // animating box: the header, and the content laid out in full even while
  // the body is shut. So a fit is known before anything moves, and every
  // dock (and the algorithm panel) can move in the same motion.
  const dockRefs = useRef<Record<DockId, HTMLDivElement | null>>({
    layers: null,
    data: null,
    manage: null,
  });
  useEffect(() => {
    const measure = () => {
      const next = { ...OPEN_GUESS };
      let header = HEADER_H;
      for (const id of DOCKS) {
        const el = dockRefs.current[id];
        const head = el?.querySelector<HTMLElement>("button[aria-expanded]");
        const content = el?.querySelector<HTMLElement>("[data-dock-content]");
        if (!head || !content) continue;
        // +2: the dock's own border, top and bottom.
        header = head.offsetHeight + 2;
        next[id] = header + content.offsetHeight;
      }
      setHeaderH((h) => (Math.abs(h - header) < 1 ? h : header));
      setOpenH((o) =>
        DOCKS.every((id) => Math.abs(o[id] - next[id]) < 1) ? o : next,
      );
    };
    const ro = new ResizeObserver(measure);
    for (const id of DOCKS) {
      const content = dockRefs.current[id]?.querySelector("[data-dock-content]");
      if (content) ro.observe(content);
    }
    return () => ro.disconnect();
  }, []);

  // Publish the stack's real height so the algorithm panel above it can stop
  // short of it. The docks open and close, so a fixed clearance goes stale.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--left-stack-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--left-stack-h");
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute bottom-16 left-16 z-[1000] flex flex-col gap-8 transition-opacity duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
        hidden ? "opacity-0 [&_*]:pointer-events-none" : "opacity-100"
      }`}
      // No scrolling: on a short screen the docks fold (see fitDocks) so the
      // stack fits under the algorithm panel.
      style={{ width }}
    >
      <div data-dock="layers" ref={(el) => void (dockRefs.current.layers = el)}>
        <MapLayerDock
          overlays={overlays}
          setOverlay={setOverlay}
          baseMap={baseMap}
          setBaseMap={setBaseMap}
          open={open.layers}
          onOpenChange={setDock("layers")}
        />
      </div>

      <div data-dock="data" ref={(el) => void (dockRefs.current.data = el)}>
        <DataDock
          floodCount={floodCount}
          depotCount={depotCount}
          ifCount={ifCount}
          faskesCount={faskesCount}
          onPreviewData={onPreviewData}
          onReloadData={onReloadData}
          reloadingData={reloadingData}
          scenario={scenario}
          open={open.data}
          onOpenChange={setDock("data")}
        />
      </div>

      {isValidElement(extraDock) ? (
        <div data-dock="manage" ref={(el) => void (dockRefs.current.manage = el)}>
          {cloneElement(extraDock as ReactElement<DockControl>, {
            open: open.manage,
            onOpenChange: setDock("manage"),
          })}
        </div>
      ) : (
        extraDock
      )}
    </div>
  );
}
