"use client";

import { MapPinPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiError, api } from "../../lib/api";
import {
  EMPTY_DRAFT,
  MAX_DEPTH_CM,
  MAX_DESCRIPTION,
  toPlaced,
  validateFloodDraft,
  type FloodDraft,
} from "../../lib/flood-input";
import type { FloodPoint } from "../../types";
import { useToast } from "../toast";
import {
  DetailColumns,
  DetailFact,
  DetailFacts,
  DetailMark,
  DetailNote,
  DetailSection,
  DetailShell,
} from "./detail-parts";

interface AddFloodPanelProps {
  point: { lat: number; lon: number };
  /** Existing points, to catch a new one dropped on top of them. */
  floods: FloodPoint[];
  scenario?: string;
  onSaved: (created: FloodPoint) => void;
  onClose: () => void;
  variant?: "fullscreen" | "embedded";
}

const inputCls =
  "font-manrope w-full rounded-md border bg-pure-white px-[10px] py-[7px] text-[13px] font-semibold text-midnight-ink outline-none transition-colors focus:border-steel";

export function AddFloodPanel({
  point,
  floods,
  scenario,
  onSaved,
  onClose,
  variant = "fullscreen",
}: AddFloodPanelProps) {
  const [fields, setFields] = useState<Pick<FloodDraft, "ketinggian" | "volume" | "deskripsi">>({
    ketinggian: EMPTY_DRAFT.ketinggian,
    volume: EMPTY_DRAFT.volume,
    deskripsi: EMPTY_DRAFT.deskripsi,
  });
  const toast = useToast();
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const placed = useMemo(() => toPlaced(floods), [floods]);
  const check = useMemo(
    () =>
      validateFloodDraft(
        { lat: String(point.lat), lon: String(point.lon), ...fields },
        placed,
      ),
    [point, fields, placed],
  );

  const set = (key: keyof typeof fields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    setServerError(null);
  };

  // Hide "required" complaints until the person has tried to save.
  const shown = (key: keyof typeof fields) =>
    touched || fields[key] !== "" ? check.errors[key] : undefined;
  const locationError = check.errors.lat ?? check.errors.lon;

  async function save() {
    setTouched(true);
    if (!check.values) return;
    setSaving(true);
    setServerError(null);
    try {
      const created = await api.createFlood(
        {
          lat: check.values.lat,
          lon: check.values.lon,
          ketinggian_cm: check.values.ketinggian_cm,
          volume_l: check.values.volume_l,
          deskripsi: check.values.deskripsi,
        } as unknown as Omit<FloodPoint, "id" | "si_value">,
        scenario,
      );
      toast.success("Titik genangan ditambahkan. Jalankan optimasi lagi agar masuk ke rute.");
      onSaved(created);
    } catch (err: unknown) {
      setServerError(
        err instanceof ApiError || err instanceof Error ? err.message : "Gagal menyimpan titik.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailShell
      label="Tambah titik genangan"
      closeLabel="Batal menambah titik"
      onClose={onClose}
      variant={variant}
      mark={
        <DetailMark color="var(--color-indigo-ink)">
          <MapPinPlus size={14} strokeWidth={2.2} />
        </DetailMark>
      }
      title="Titik genangan baru"
      badge={{ label: "Belum disimpan", cls: "bg-[#fffbeb] text-[#b45309]" }}
      subtitle="Seret penanda di peta untuk menggeser lokasi."
    >
      <DetailColumns>
        <DetailSection title="Lokasi">
          <DetailFacts>
            <DetailFact label="Lintang" value={point.lat.toFixed(6)} />
            <DetailFact label="Bujur" value={point.lon.toFixed(6)} />
          </DetailFacts>
          {locationError ? (
            <p className="m-0 text-[12px] font-semibold text-indigo-ink">{locationError}</p>
          ) : (
            <DetailNote>
              Kelas jalan dan jarak ke faskes diisi otomatis dari lokasi ini, lalu tingkat
              keparahan (SI) dihitung ulang untuk semua titik.
            </DetailNote>
          )}
        </DetailSection>

        <DetailSection title="Data genangan">
          <div className="grid grid-cols-1 gap-[10px] @min-[520px]:grid-cols-2">
            <Field
              label="Tinggi genangan (cm)"
              required
              error={shown("ketinggian")}
              hint={`1 sampai ${MAX_DEPTH_CM} cm`}
            >
              <input
                type="number"
                inputMode="decimal"
                min={1}
                max={MAX_DEPTH_CM}
                step={1}
                value={fields.ketinggian}
                onChange={(e) => set("ketinggian", e.currentTarget.value)}
                aria-invalid={Boolean(shown("ketinggian"))}
                className={`${inputCls} ${shown("ketinggian") ? "border-indigo-ink" : "border-frost"}`}
              />
            </Field>
            <Field
              label="Volume (liter)"
              error={shown("volume")}
              hint="Kosongkan agar dihitung otomatis"
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                value={fields.volume}
                onChange={(e) => set("volume", e.currentTarget.value)}
                aria-invalid={Boolean(shown("volume"))}
                className={`${inputCls} ${shown("volume") ? "border-indigo-ink" : "border-frost"}`}
              />
            </Field>
            <div className="@min-[520px]:col-span-2">
              <Field
                label="Deskripsi lokasi"
                error={shown("deskripsi")}
                hint={`${fields.deskripsi.length}/${MAX_DESCRIPTION}`}
              >
                <input
                  type="text"
                  value={fields.deskripsi}
                  onChange={(e) => set("deskripsi", e.currentTarget.value)}
                  placeholder="Mis. Jl. Raya Darmo depan RS"
                  className={`${inputCls} ${shown("deskripsi") ? "border-indigo-ink" : "border-frost"}`}
                />
              </Field>
            </div>
          </div>

          {check.warnings.map((w) => (
            <p key={w} className="m-0 text-[12px] font-semibold text-[#b45309]">
              {w}
            </p>
          ))}
          {serverError ? (
            <p role="alert" className="m-0 text-[12px] font-semibold text-indigo-ink">
              {serverError}
            </p>
          ) : null}

          <div className="mt-auto flex items-center justify-end gap-8 pt-[4px]">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-frost bg-pure-white px-[14px] py-[8px] text-[12.5px] font-bold text-midnight-ink transition-colors hover:bg-mist"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={`rounded-md border-0 bg-indigo-ink px-[16px] py-[8px] text-[12.5px] font-bold text-white transition-colors hover:bg-indigo-hover ${
                saving ? "cursor-wait opacity-70" : "cursor-pointer"
              }`}
            >
              {saving ? "Menyimpan..." : "Simpan titik"}
            </button>
          </div>
        </DetailSection>
      </DetailColumns>
    </DetailShell>
  );
}

function Field({
  label,
  required = false,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[4px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-slate">
        {label}
        {required ? <span className="text-indigo-ink"> *</span> : null}
      </span>
      {children}
      <span
        className={`text-[11px] ${error ? "font-semibold text-indigo-ink" : "font-medium text-slate"}`}
      >
        {error ?? hint}
      </span>
    </label>
  );
}
