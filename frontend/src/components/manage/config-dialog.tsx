"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { UseFleetConfig } from "../../hooks/use-fleet-config";
import type { UsePriority } from "../../hooks/use-priority";
import { api } from "../../lib/api";
import {
  defaultFleetSettings,
  validateFleet,
  type FleetSettings,
} from "../../lib/fleet";
import { DEFAULT_PRIORITY, priorityPayload, samePriority, type PriorityState } from "../../lib/priority";
import type { Depot } from "../../types";
import { Dialog, DialogButton } from "../dialog";
import { useToast } from "../toast";
import { FleetEditor } from "./fleet-editor";
import { PriorityEditor } from "./priority-editor";

export type ConfigTab = "fleet" | "priority";

interface ConfigDialogProps {
  open: boolean;
  tab: ConfigTab;
  onClose: () => void;
  depots: Depot[];
  fleet: UseFleetConfig;
  priority: UsePriority;
  scenario?: string;
}

/** Fleet and priority settings in one dialog; nothing takes effect until Terapkan. */
export function ConfigDialog(props: ConfigDialogProps) {
  // The body mounts per open, so its drafts always start from what is applied.
  return props.open ? <ConfigBody {...props} /> : null;
}

const TABS: { id: ConfigTab; label: string }[] = [
  { id: "fleet", label: "Armada & Depo" },
  { id: "priority", label: "Prioritas Keparahan" },
];

function ConfigBody({
  tab: initialTab,
  onClose,
  depots,
  fleet,
  priority,
  scenario,
}: ConfigDialogProps) {
  const toast = useToast();
  const [tab, setTab] = useState<ConfigTab>(initialTab);
  const [fleetDraft, setFleetDraft] = useState<FleetSettings>(fleet.settings);
  const [priorityDraft, setPriorityDraft] = useState<PriorityState>(priority.priority);
  const [defaultShares, setDefaultShares] = useState<number[] | null>(null);

  // What the default AHP + entropy mix currently comes to, as a reference.
  useEffect(() => {
    let alive = true;
    api
      .getSeverityIndex(scenario)
      .then((r) => {
        if (alive) setDefaultShares(r.weights.combined);
      })
      .catch(() => {
        /* the reference bars simply stay empty */
      });
    return () => {
      alive = false;
    };
  }, [scenario]);

  const problems = useMemo(
    () => validateFleet(fleetDraft, depots, fleet.defaults),
    [fleetDraft, depots, fleet.defaults],
  );
  const priorityInvalid = priorityDraft.mode === "custom" && priorityPayload(priorityDraft) === null;

  const fleetChanged = JSON.stringify(fleetDraft) !== JSON.stringify(fleet.settings);
  const priorityChanged = !samePriority(priorityDraft, priority.priority);

  const apply = () => {
    if (fleetChanged) fleet.setSettings(fleetDraft);
    if (priorityChanged) priority.setPriority(priorityDraft);
    const what = [fleetChanged && "armada", priorityChanged && "prioritas"].filter(Boolean).join(" dan ");
    toast.success(`Pengaturan ${what} diterapkan. Jalankan optimasi lagi untuk memakainya.`);
    onClose();
  };

  const resetTab = () => {
    if (tab === "fleet") setFleetDraft(defaultFleetSettings(fleet.defaults));
    else setPriorityDraft(DEFAULT_PRIORITY);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Konfigurasi Optimasi"
      subtitle="Atur armada, depo, dan prioritas titik genangan. Perubahan berlaku pada proses optimasi berikutnya."
      width={760}
      footer={
        <>
          <DialogButton tone="ghost" onClick={resetTab}>
            <RotateCcw size={13} strokeWidth={2.2} />
            Atur ulang bawaan
          </DialogButton>
          <span className="flex-1" />
          <DialogButton tone="secondary" onClick={onClose}>
            Batal
          </DialogButton>
          <DialogButton
            tone="primary"
            onClick={apply}
            disabled={problems.length > 0 || priorityInvalid || (!fleetChanged && !priorityChanged)}
          >
            Terapkan
          </DialogButton>
        </>
      }
    >
      <div className="sticky top-0 z-[1] border-b border-frost bg-pure-white px-[18px] py-[10px]">
        <div
          role="tablist"
          aria-label="Bagian konfigurasi"
          className="inline-flex gap-[4px] rounded-lg bg-periwinkle-wash p-[4px]"
        >
          {TABS.map((t) => {
            const dirty = t.id === "fleet" ? fleetChanged : priorityChanged;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex cursor-pointer items-center gap-[6px] rounded-md border px-[12px] py-[6px] text-[12.5px] transition-colors ${
                  tab === t.id
                    ? "border-frost bg-pure-white font-bold text-midnight-ink"
                    : "border-transparent bg-transparent font-semibold text-steel"
                }`}
              >
                {t.label}
                {dirty ? (
                  <span aria-label="Ada perubahan" className="h-[6px] w-[6px] rounded-full bg-indigo-ink" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "fleet" ? (
        <FleetEditor
          depots={depots}
          value={fleetDraft}
          defaults={fleet.defaults}
          problems={problems}
          onChange={setFleetDraft}
        />
      ) : (
        <PriorityEditor value={priorityDraft} defaultShares={defaultShares} onChange={setPriorityDraft} />
      )}
    </Dialog>
  );
}
