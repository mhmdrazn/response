import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { OptimizationResult } from "../types";
import { formatDuration, formatMeters, formatNumber } from "./format-metrics";

export function exportReport(result: OptimizationResult): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 20;
  const cw = pw - margin * 2;
  let y = margin;

  // ── Header ──
  doc.setFillColor(83, 58, 253);
  doc.rect(0, 0, pw, 36, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Response", margin, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Laporan Hasil Optimasi Rute Penyedotan Genangan", margin, 24);

  const dateStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.setFontSize(8);
  doc.text(dateStr, pw - margin, 24, { align: "right" });

  y = 46;

  // ── Summary metrics ──
  doc.setTextColor(100, 116, 141);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("RINGKASAN HASIL", margin, y);
  y += 6;

  const metrics = [
    ["Skor Respons (Z)", formatNumber(result.objective_z, 0)],
    ["Total Jarak", formatMeters(result.total_distance_m)],
    ["Total Waktu Operasi", formatDuration(result.total_time_s)],
    ["Waktu Komputasi", formatDuration(result.computation_time_s)],
    ["Jumlah Kendaraan", String(result.n_vehicles)],
    ["Titik Genangan Dilayani", String(result.total_flood_visits)],
    ["Titik Buang Air Dikunjungi", String(result.total_if_visits)],
    ["Revisit", String(result.total_revisits)],
    ["Algoritma", result.algorithm.toUpperCase()],
  ];

  const colW = cw / 3;
  for (let i = 0; i < metrics.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + col * colW;
    const my = y + row * 14;

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 141);
    doc.text(metrics[i][0], x, my);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(6, 27, 49);
    doc.text(metrics[i][1], x, my + 6);
  }

  y += Math.ceil(metrics.length / 3) * 14 + 6;

  // ── Divider ──
  doc.setDrawColor(229, 237, 245);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pw - margin, y);
  y += 8;

  // ── Route summary table ──
  doc.setTextColor(100, 116, 141);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("DETAIL RUTE KENDARAAN", margin, y);
  y += 4;

  const routeRows = result.routes.map((r) => [
    r.vehicle_id,
    r.depot_name || r.depot_id,
    `${r.capacity_l.toLocaleString()} L`,
    String(r.visit_count_flood),
    String(r.visit_count_if),
    formatMeters(r.total_distance_m),
    formatDuration(r.total_time_s),
    formatNumber(r.z_contribution, 0),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      ["Kendaraan", "Depo", "Kapasitas", "Genangan", "Buang Air", "Jarak", "Waktu", "Kontribusi Z"],
    ],
    body: routeRows,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 3,
      lineColor: [229, 237, 245],
      lineWidth: 0.3,
      textColor: [6, 27, 49],
    },
    headStyles: {
      fillColor: [248, 250, 253],
      textColor: [100, 116, 141],
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 253],
    },
    theme: "grid",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Visit details per route ──
  for (const route of result.routes) {
    if (y > 250) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(83, 58, 253);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${route.vehicle_id} — ${route.depot_name || route.depot_id}`, margin, y);

    doc.setTextColor(100, 116, 141);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${route.capacity_l.toLocaleString()} L · ${formatMeters(route.total_distance_m)} · ${formatDuration(route.total_time_s)}`,
      margin,
      y + 5,
    );
    y += 9;

    const visitRows = route.visits.map((v, i) => [
      String(i + 1),
      v.node_name,
      v.node_type === "flood" ? "Genangan" : v.node_type === "if" ? "Buang Air" : "Depo",
      formatDuration(v.arrival_time_s),
      v.volume_pumped_l > 0 ? `${v.volume_pumped_l.toLocaleString()} L` : "—",
      `${v.tank_load_after_l.toLocaleString()} L`,
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Lokasi", "Tipe", "Waktu Tiba", "Volume", "Muatan Tangki"]],
      body: visitRows,
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 2.5,
        lineColor: [229, 237, 245],
        lineWidth: 0.2,
        textColor: [6, 27, 49],
      },
      headStyles: {
        fillColor: [232, 233, 255],
        textColor: [83, 58, 253],
        fontStyle: "bold",
        fontSize: 6.5,
      },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      theme: "grid",
      columnStyles: {
        0: { cellWidth: 8 },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 141);
    doc.text(
      `Response — SPK Damkar Surabaya · Halaman ${p}/${pageCount}`,
      pw / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
  }

  doc.save(`laporan-optimasi-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportJSON(result: OptimizationResult): void {
  const json = JSON.stringify(result, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `optimasi-${result.algorithm}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(result: OptimizationResult): void {
  const headers = [
    "vehicle_id",
    "depot_id",
    "depot_name",
    "capacity_l",
    "visit_count_flood",
    "visit_count_if",
    "total_distance_m",
    "total_time_s",
    "z_contribution",
  ];
  const rows = result.routes.map((r) =>
    [
      r.vehicle_id,
      r.depot_id,
      r.depot_name,
      r.capacity_l,
      r.visit_count_flood,
      r.visit_count_if,
      r.total_distance_m.toFixed(2),
      r.total_time_s.toFixed(2),
      r.z_contribution.toFixed(2),
    ].join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rute-${result.algorithm}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
