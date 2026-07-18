"use client";

import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { api } from "../lib/api";
import type { Depot, Faskes, FloodPoint, IntermediateFacility } from "../types";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

export type DatasetKey = "floods" | "depots" | "ifs" | "faskes";

interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number";
  width?: number;
}

const DATASET_CONFIG: Record<DatasetKey, { title: string; columns: ColumnDef[]; apiPath: string }> =
  {
    floods: {
      title: "Data Genangan",
      apiPath: "floods",
      columns: [
        { key: "id", label: "ID", type: "text", width: 80 },
        { key: "lat", label: "Latitude", type: "number", width: 110 },
        { key: "lon", label: "Longitude", type: "number", width: 110 },
        { key: "datetime", label: "Waktu", type: "text", width: 160 },
        { key: "deskripsi", label: "Deskripsi", type: "text", width: 200 },
        { key: "ketinggian_cm", label: "Tinggi (cm)", type: "number", width: 100 },
      ],
    },
    depots: {
      title: "Data Depo",
      apiPath: "depo",
      columns: [
        { key: "id", label: "ID", type: "text", width: 120 },
        { key: "osm_id", label: "OSM ID", type: "number", width: 120 },
        { key: "lat", label: "Latitude", type: "number", width: 110 },
        { key: "lon", label: "Longitude", type: "number", width: 110 },
        { key: "name", label: "Nama", type: "text", width: 180 },
        { key: "city", label: "Kota", type: "text", width: 120 },
        { key: "type", label: "Tipe", type: "text", width: 100 },
      ],
    },
    ifs: {
      title: "Data Titik Buang Air",
      apiPath: "if",
      columns: [
        { key: "id", label: "ID", type: "text", width: 80 },
        { key: "lat", label: "Latitude", type: "number", width: 110 },
        { key: "lon", label: "Longitude", type: "number", width: 110 },
        { key: "waterway_name", label: "Nama Sungai", type: "text", width: 160 },
        { key: "waterway_type", label: "Tipe Sungai", type: "text", width: 120 },
        { key: "highway_name", label: "Nama Jalan", type: "text", width: 160 },
        { key: "distance_to_water_m", label: "Jarak Air (m)", type: "number", width: 110 },
      ],
    },
    faskes: {
      title: "Data Faskes",
      apiPath: "faskes",
      columns: [
        { key: "id", label: "ID", type: "text", width: 120 },
        { key: "osm_id", label: "OSM ID", type: "number", width: 120 },
        { key: "lat", label: "Latitude", type: "number", width: 110 },
        { key: "lon", label: "Longitude", type: "number", width: 110 },
        { key: "name", label: "Nama", type: "text", width: 200 },
        { key: "amenity", label: "Amenity", type: "text", width: 120 },
        { key: "street", label: "Jalan", type: "text", width: 160 },
        { key: "type", label: "Tipe", type: "text", width: 100 },
      ],
    },
  };

type DataItem = FloodPoint | Depot | IntermediateFacility | Faskes;

interface DataTableModalProps {
  datasetKey: DatasetKey;
  data: DataItem[];
  onClose: () => void;
  onReload: () => void;
}

export function DataTableModal({ datasetKey, data, onClose, onReload }: DataTableModalProps) {
  const config = DATASET_CONFIG[datasetKey];
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const editableCols = useMemo(
    () => config.columns.filter((c) => c.key !== "id"),
    [config.columns],
  );

  const startEdit = useCallback(
    (item: DataItem) => {
      const form: Record<string, string> = {};
      for (const col of editableCols) {
        const val = (item as unknown as Record<string, unknown>)[col.key];
        form[col.key] = val != null ? String(val) : "";
      }
      setEditingId((item as unknown as Record<string, unknown>).id as string);
      setEditForm(form);
    },
    [editableCols],
  );

  const startAdd = useCallback(() => {
    const form: Record<string, string> = {};
    for (const col of editableCols) form[col.key] = "";
    setAddForm(form);
    setIsAdding(true);
  }, [editableCols]);

  function buildPayload(form: Record<string, string>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const col of editableCols) {
      const raw = form[col.key]?.trim();
      if (!raw) {
        payload[col.key] = null;
        continue;
      }
      payload[col.key] = col.type === "number" ? Number(raw) : raw;
    }
    return payload;
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setBusy(true);
    try {
      const payload = buildPayload(editForm);
      if (datasetKey === "floods") await api.updateFlood(editingId, payload);
      else if (datasetKey === "depots") await api.updateDepot(editingId, payload);
      else if (datasetKey === "ifs") await api.updateIF(editingId, payload);
      else await api.updateFaskes(editingId, payload);
      setEditingId(null);
      onReload();
      toast.success("Perubahan tersimpan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    setBusy(true);
    try {
      const payload = buildPayload(addForm);
      if (datasetKey === "floods")
        await api.createFlood(payload as Parameters<typeof api.createFlood>[0]);
      else if (datasetKey === "depots")
        await api.createDepot(payload as Parameters<typeof api.createDepot>[0]);
      else if (datasetKey === "ifs")
        await api.createIF(payload as Parameters<typeof api.createIF>[0]);
      else await api.createFaskes(payload as Parameters<typeof api.createFaskes>[0]);
      setIsAdding(false);
      onReload();
      toast.success("Data ditambahkan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambahkan");
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);
    setBusy(true);
    try {
      if (datasetKey === "floods") await api.deleteFlood(id);
      else if (datasetKey === "depots") await api.deleteDepot(id);
      else if (datasetKey === "ifs") await api.deleteIF(id);
      else await api.deleteFaskes(id);
      onReload();
      toast.success("Data dihapus");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
      // If the row is already gone server-side (404) our client view is
      // stale — refetch so the ghost row disappears from the table.
      onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Hapus data ini?"
        description="Baris yang dihapus tidak dapat dikembalikan. CSV di disk akan langsung diperbarui."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(6,27,49,0.45)",
          backdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            background: "var(--color-pure-white)",
            border: "1px solid var(--color-frost)",
            borderRadius: "var(--radius-lg)",
            width: "min(90vw, 960px)",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-frost)",
              flexShrink: 0,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-midnight-ink)",
                  letterSpacing: "-0.16px",
                  margin: 0,
                }}
              >
                {config.title}
              </h2>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-steel)",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                {data.length} data
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={startAdd}
                disabled={isAdding || busy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--color-indigo-ink)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "var(--font-weight-bold)",
                  cursor: "pointer",
                  letterSpacing: "-0.12px",
                }}
              >
                <Plus size={13} strokeWidth={2.5} />
                Tambah
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-frost)",
                  background: "var(--color-pure-white)",
                  color: "var(--color-slate)",
                  cursor: "pointer",
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--font-manrope)",
                fontSize: 12,
                minWidth: config.columns.reduce((s, c) => s + (c.width ?? 100), 0) + 80,
              }}
            >
              <thead>
                <tr>
                  {config.columns.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "var(--color-mist)",
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: "var(--font-weight-bold)",
                        color: "var(--color-slate)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.7px",
                        borderBottom: "1px solid var(--color-frost)",
                        width: col.width,
                        whiteSpace: "nowrap",
                        zIndex: 1,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "var(--color-mist)",
                      padding: "10px 12px",
                      width: 80,
                      borderBottom: "1px solid var(--color-frost)",
                      zIndex: 1,
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {/* Add row */}
                {isAdding ? (
                  <tr style={{ background: "var(--color-periwinkle-wash)" }}>
                    {config.columns.map((col) => (
                      <td key={col.key} style={{ padding: "6px 12px" }}>
                        {col.key === "id" ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--color-steel)",
                              fontStyle: "italic",
                            }}
                          >
                            auto
                          </span>
                        ) : (
                          <input
                            type={col.type === "number" ? "number" : "text"}
                            value={addForm[col.key] ?? ""}
                            onChange={(e) =>
                              setAddForm((f) => ({
                                ...f,
                                [col.key]: e.target.value,
                              }))
                            }
                            style={{
                              width: "100%",
                              padding: "5px 7px",
                              fontSize: 12,
                              border: "1px solid var(--color-lavender-border)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--color-pure-white)",
                              fontFamily: "var(--font-manrope)",
                              outline: "none",
                            }}
                          />
                        )}
                      </td>
                    ))}
                    <td style={{ padding: "6px 8px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <ActionBtn
                          onClick={handleAdd}
                          disabled={busy}
                          color="var(--color-indigo-ink)"
                          title="Simpan"
                        >
                          <Check size={13} strokeWidth={2.5} />
                        </ActionBtn>
                        <ActionBtn
                          onClick={() => setIsAdding(false)}
                          disabled={busy}
                          color="var(--color-slate)"
                          title="Batal"
                        >
                          <X size={13} strokeWidth={2.5} />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {/* Data rows */}
                {data.map((item) => {
                  const rec = item as unknown as Record<string, unknown>;
                  const id = rec.id as string;
                  const isEditing = editingId === id;
                  return (
                    <tr
                      key={id}
                      style={{
                        borderBottom: "1px solid var(--color-frost)",
                        background: isEditing ? "var(--color-periwinkle-wash)" : "transparent",
                      }}
                    >
                      {config.columns.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            padding: "8px 12px",
                            color: "var(--color-midnight-ink)",
                            fontWeight:
                              col.key === "id"
                                ? "var(--font-weight-semibold)"
                                : "var(--font-weight-regular)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: col.width,
                          }}
                        >
                          {isEditing && col.key !== "id" ? (
                            <input
                              type={col.type === "number" ? "number" : "text"}
                              value={editForm[col.key] ?? ""}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  [col.key]: e.target.value,
                                }))
                              }
                              style={{
                                width: "100%",
                                padding: "4px 6px",
                                fontSize: 12,
                                border: "1px solid var(--color-lavender-border)",
                                borderRadius: "var(--radius-sm)",
                                background: "var(--color-pure-white)",
                                fontFamily: "var(--font-manrope)",
                                outline: "none",
                              }}
                            />
                          ) : (
                            <span>{rec[col.key] != null ? String(rec[col.key]) : "—"}</span>
                          )}
                        </td>
                      ))}
                      <td style={{ padding: "8px 8px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {isEditing ? (
                            <>
                              <ActionBtn
                                onClick={handleSaveEdit}
                                disabled={busy}
                                color="var(--color-indigo-ink)"
                                title="Simpan"
                              >
                                <Check size={13} strokeWidth={2.5} />
                              </ActionBtn>
                              <ActionBtn
                                onClick={() => setEditingId(null)}
                                disabled={busy}
                                color="var(--color-slate)"
                                title="Batal"
                              >
                                <X size={13} strokeWidth={2.5} />
                              </ActionBtn>
                            </>
                          ) : (
                            <>
                              <ActionBtn
                                onClick={() => startEdit(item)}
                                disabled={busy}
                                color="var(--color-indigo-ink)"
                                title="Edit"
                              >
                                <Pencil size={12} strokeWidth={2} />
                              </ActionBtn>
                              <ActionBtn
                                onClick={() => handleDelete(id)}
                                disabled={busy}
                                color="#ef4444"
                                title="Hapus"
                              >
                                <Trash2 size={12} strokeWidth={2} />
                              </ActionBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function ActionBtn({
  onClick,
  disabled,
  color,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-frost)",
        background: "var(--color-pure-white)",
        color,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
