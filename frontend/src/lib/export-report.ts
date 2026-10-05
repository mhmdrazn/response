import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { OptimizationResult } from "../types";
import { formatDuration, formatMeters, formatNumber } from "./format-metrics";
import { downloadXlsx, type Cell } from "./xlsx";

export function exportReport(result: OptimizationResult): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 20;
  const cw = pw - margin * 2;
  let y = margin;

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

  doc.setTextColor(100, 116, 141);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("RINGKASAN HASIL", margin, y);
  y += 6;

  const metrics = [
    ["Skor Respons (Z)", formatNumber(result.objective_z, 0)],
    ["Cakupan Pemompaan", `${formatNumber(result.coverage_pct, 1)}%`],
    ["Skor Total", formatNumber(result.score, 0)],
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

  doc.setDrawColor(229, 237, 245);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pw - margin, y);
  y += 8;

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

  // jspdf-autotable exposes finalY only on the untyped doc instance
  y = (doc as any).lastAutoTable.finalY + 10; // eslint-disable-line @typescript-eslint/no-explicit-any

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

    y = (doc as any).lastAutoTable.finalY + 8; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

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

const NODE_KIND: Record<string, string> = { depot: "Depo", flood: "Genangan", if: "IF (buang air)" };

/** Plan as a workbook: a summary, one row per vehicle, one row per stop. */
export function exportExcel(result: OptimizationResult): void {
  const summary: Cell[][] = [
    ["Metrik", "Nilai"],
    ["Algoritma", result.algorithm.toUpperCase()],
    ["Skor Respons (Z)", result.objective_z],
    ["Penalti beban tersisa", result.penalty],
    ["Skor Total (Z + penalti)", result.score],
    ["Cakupan pemompaan (%)", Number(result.coverage_pct.toFixed(2))],
    ["Beban total (L)", Math.round(result.demand_total_l)],
    ["Beban belum tuntas (L)", Math.round(result.unserved_volume_l)],
    ["Titik belum tuntas", result.unserved_points],
    ["Total jarak (km)", Number((result.total_distance_m / 1000).toFixed(2))],
    ["Total waktu (jam)", Number((result.total_time_s / 3600).toFixed(2))],
    ["Waktu komputasi (detik)", Number(result.computation_time_s.toFixed(1))],
    ["Kendaraan aktif", result.n_vehicles],
    ["Kunjungan genangan", result.total_flood_visits],
    ["Kunjungan IF", result.total_if_visits],
    ["Kunjungan ulang", result.total_revisits],
  ];

  const routes: Cell[][] = [
    [
      "Kendaraan",
      "Depo",
      "Kapasitas (L)",
      "Kunjungan genangan",
      "Kunjungan IF",
      "Jarak (km)",
      "Waktu (menit)",
      "Kontribusi Z",
    ],
    ...result.routes.map((r): Cell[] => [
      r.vehicle_id,
      r.depot_name,
      r.capacity_l,
      r.visit_count_flood,
      r.visit_count_if,
      Number((r.total_distance_m / 1000).toFixed(2)),
      Number((r.total_time_s / 60).toFixed(1)),
      Number(r.z_contribution.toFixed(2)),
    ]),
  ];

  const stops: Cell[][] = [
    [
      "Kendaraan",
      "Depo",
      "Urutan",
      "Jenis",
      "Titik",
      "ID titik",
      "Tiba (menit sejak berangkat)",
      "Volume dipompa (L)",
      "Isi tangki sesudahnya (L)",
    ],
  ];
  for (const r of result.routes) {
    r.visits.forEach((v, i) => {
      stops.push([
        r.vehicle_id,
        r.depot_name,
        i + 1,
        NODE_KIND[v.node_type] ?? v.node_type,
        v.node_name,
        v.node_id,
        Number((v.arrival_time_s / 60).toFixed(1)),
        Math.round(v.volume_pumped_l),
        Math.round(v.tank_load_after_l),
      ]);
    });
  }

  downloadXlsx(
    `optimasi-${result.algorithm}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    [
      { name: "Ringkasan", rows: summary },
      { name: "Rute", rows: routes },
      { name: "Kunjungan", rows: stops },
    ],
  );
}
