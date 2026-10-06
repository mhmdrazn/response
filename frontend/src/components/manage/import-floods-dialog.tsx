"use client";

import { AlertCircle, CheckCircle2, Download, FileUp, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";

import { api } from "../../lib/api";
import {
  CSV_TEMPLATE,
  MAX_IMPORT_ROWS,
  parseFloodCsv,
  type ImportParse,
  type ImportRow,
} from "../../lib/flood-input";
import { formatNumber } from "../../lib/format-metrics";
import type { FloodPoint } from "../../types";
import { Dialog, DialogButton } from "../dialog";
import { useToast } from "../toast";

interface ImportFloodsDialogProps {
  open: boolean;
  onClose: () => void;
  existing: FloodPoint[];
  scenario?: string;
  /** Called after the upload finishes, with how many points were saved. */
  onImported: (saved: number) => void;
}

/** Never larger than a few hundred rows of text; anything bigger is not a flood list. */
const MAX_FILE_BYTES = 512 * 1024;

export function ImportFloodsDialog(props: ImportFloodsDialogProps) {
  // The body mounts per open, so each upload starts from an empty state.
  return props.open ? <ImportBody {...props} /> : null;
}

interface Outcome {
  line: number;
  ok: boolean;
  message?: string;
}

function ImportBody({ onClose, existing, scenario, onImported }: ImportFloodsDialogProps) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportParse | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const valid = parsed?.rows.filter((r) => r.validation.values) ?? [];
  const invalid = (parsed?.rows.length ?? 0) - valid.length;

  async function load(file: File | undefined) {
    if (!file) return;
    setOutcomes(null);
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParsed({ fileError: "File terlalu besar untuk daftar genangan.", rows: [] });
      return;
    }
    setParsed(parseFloodCsv(await file.text(), existing));
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "templat-titik-genangan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    setSaving(true);
    setProgress(0);
    const results: Outcome[] = [];
    // One at a time: each point is routed against the whole network and the
    // distance matrices are rewritten, so parallel requests would collide.
    for (let i = 0; i < valid.length; i++) {
      const row = valid[i];
      const v = row.validation.values!;
      try {
        await api.createFlood(
          {
            lat: v.lat,
            lon: v.lon,
            ketinggian_cm: v.ketinggian_cm,
            volume_l: v.volume_l,
            deskripsi: v.deskripsi,
          } as unknown as Omit<FloodPoint, "id" | "si_value">,
          scenario,
        );
        results.push({ line: row.line, ok: true });
      } catch (err: unknown) {
        results.push({
          line: row.line,
          ok: false,
          message: err instanceof Error ? err.message : "Gagal disimpan.",
        });
      }
      setProgress(i + 1);
    }
    setOutcomes(results);
    setSaving(false);
    const saved = results.filter((r) => r.ok).length;
    if (saved > 0) {
      toast.success(`${saved} titik genangan ditambahkan. Jalankan optimasi lagi agar masuk ke rute.`);
      onImported(saved);
    }
  }

  const savedCount = outcomes?.filter((o) => o.ok).length ?? 0;
  const failed = outcomes?.filter((o) => !o.ok) ?? [];

  return (
    <Dialog
      open
      onClose={saving ? () => undefined : onClose}
      title="Unggah Titik Genangan"
      subtitle={`File CSV, maksimal ${MAX_IMPORT_ROWS} titik. Tingkat keparahan dihitung otomatis dari tinggi genangan, kelas jalan, dan jarak ke faskes.`}
      width={820}
      footer={
        outcomes ? (
          <>
            <span className="flex-1 text-[12.5px] font-semibold text-steel">
              {savedCount} titik tersimpan{failed.length > 0 ? `, ${failed.length} gagal` : ""}.
            </span>
            <DialogButton tone="primary" onClick={onClose}>
              Selesai
            </DialogButton>
          </>
        ) : (
          <>
            <DialogButton tone="ghost" onClick={downloadTemplate} disabled={saving}>
              <Download size={13} strokeWidth={2.2} />
              Unduh templat
            </DialogButton>
            <span className="flex-1 text-[12.5px] font-semibold text-steel">
              {saving
                ? `Menyimpan ${progress} dari ${valid.length}...`
                : parsed && !parsed.fileError
                  ? `${valid.length} siap diimpor${invalid > 0 ? `, ${invalid} perlu diperbaiki` : ""}`
                  : ""}
            </span>
            <DialogButton tone="secondary" onClick={onClose} disabled={saving}>
              Batal
            </DialogButton>
            <DialogButton tone="primary" onClick={run} disabled={saving || valid.length === 0}>
              {valid.length > 0 ? `Impor ${valid.length} titik` : "Impor"}
            </DialogButton>
          </>
        )
      }
    >
      <div className="flex flex-col gap-[14px] px-[18px] py-[14px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void load(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-[8px] rounded-lg border border-dashed px-[16px] py-[20px] text-center transition-colors ${
            dragging ? "border-steel bg-periwinkle-wash" : "border-smoke bg-mist"
          }`}
        >
          <FileUp size={22} strokeWidth={1.8} color="var(--color-steel)" />
          <div className="text-[13px] font-bold text-midnight-ink">
            {fileName ?? "Tarik file CSV ke sini"}
          </div>
          <div className="max-w-[560px] text-[11.5px] font-medium leading-[1.45] text-slate">
            Kolom wajib: <b>lat</b>, <b>lon</b>, <b>ketinggian_cm</b>. Opsional: <b>volume_l</b>{" "}
            (kosong = dihitung otomatis), <b>deskripsi</b>, <b>severity</b> (diabaikan). Pemisah
            koma atau titik koma.
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={saving}
            className="cursor-pointer rounded-md border border-frost bg-pure-white px-[14px] py-[7px] text-[12.5px] font-bold text-midnight-ink transition-colors hover:bg-frost disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fileName ? "Pilih file lain" : "Pilih file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              void load(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {parsed?.fileError ? (
          <div
            role="alert"
            className="flex items-start gap-[8px] rounded-md border border-[#fecaca] bg-[#fef2f2] px-[12px] py-[10px] text-[12.5px] font-semibold leading-[1.4] text-[#b91c1c]"
          >
            <AlertCircle size={15} strokeWidth={2.2} className="mt-px flex-shrink-0" />
            {parsed.fileError}
          </div>
        ) : null}

        {failed.length > 0 ? (
          <div className="flex flex-col gap-[4px] rounded-md border border-[#fecaca] bg-[#fef2f2] px-[12px] py-[10px] text-[12px] font-semibold text-[#b91c1c]">
            {failed.map((f) => (
              <div key={f.line}>
                Baris {f.line}: {f.message}
              </div>
            ))}
          </div>
        ) : null}

        {parsed && !parsed.fileError ? (
          <PreviewTable rows={parsed.rows} outcomes={outcomes} />
        ) : null}
      </div>
    </Dialog>
  );
}

function PreviewTable({ rows, outcomes }: { rows: ImportRow[]; outcomes: Outcome[] | null }) {
  const outcomeOf = (line: number) => outcomes?.find((o) => o.line === line);

  return (
    <div className="overflow-x-auto rounded-md border border-frost">
      <table className="w-full min-w-[620px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="bg-mist text-[10px] font-bold uppercase tracking-[0.7px] text-slate">
            <th className="w-[44px] px-[10px] py-[8px] text-right">Baris</th>
            <th className="px-[10px] py-[8px]">Lokasi</th>
            <th className="w-[84px] px-[10px] py-[8px] text-right">Tinggi (cm)</th>
            <th className="w-[96px] px-[10px] py-[8px] text-right">Volume (L)</th>
            <th className="px-[10px] py-[8px]">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const errs = Object.values(r.validation.errors);
            const done = outcomeOf(r.line);
            return (
              <tr key={r.line} className="border-t border-frost align-top">
                <td className="px-[10px] py-[8px] text-right font-medium tabular-nums text-slate">
                  {r.line}
                </td>
                <td className="px-[10px] py-[8px]">
                  <div className="font-semibold tabular-nums text-midnight-ink">
                    {r.draft.lat}, {r.draft.lon}
                  </div>
                  {r.draft.deskripsi ? (
                    <div className="max-w-[300px] truncate text-[11px] font-medium text-slate">
                      {r.draft.deskripsi}
                    </div>
                  ) : null}
                </td>
                <td className="px-[10px] py-[8px] text-right font-semibold tabular-nums text-midnight-ink">
                  {r.draft.ketinggian || "-"}
                </td>
                <td className="px-[10px] py-[8px] text-right font-medium tabular-nums text-steel">
                  {r.draft.volume
                    ? formatNumber(Number(r.draft.volume.replace(",", ".")) || 0)
                    : "otomatis"}
                </td>
                <td className="px-[10px] py-[8px]">
                  {done ? (
                    done.ok ? (
                      <Status tone="ok">Tersimpan</Status>
                    ) : (
                      <Status tone="bad">{done.message}</Status>
                    )
                  ) : errs.length > 0 ? (
                    <Status tone="bad">{errs.join(" ")}</Status>
                  ) : (
                    <>
                      <Status tone="ok">Siap</Status>
                      {r.notes.map((n) => (
                        <Status key={n} tone="warn">
                          {n}
                        </Status>
                      ))}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Status({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? TriangleAlert : AlertCircle;
  const cls =
    tone === "ok" ? "text-[#15803d]" : tone === "warn" ? "text-[#b45309]" : "text-[#b91c1c]";
  return (
    <div className={`flex items-start gap-[5px] text-[11.5px] font-semibold leading-[1.35] ${cls}`}>
      <Icon size={13} strokeWidth={2.2} className="mt-px flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
