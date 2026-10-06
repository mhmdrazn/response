import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

import type { OptimizationResult, RouteOut } from "../types";
import { formatDuration, formatMeters, formatNumber } from "./format-metrics";
import { ROUTE_COLORS } from "./map-constants";
import { cycleShort, labelCycles } from "./route-cycles";
import { downloadXlsx, type Cell, type Sheet } from "./xlsx";

interface ExportContext {
  /** When the plan was computed (ms since epoch); defaults to now. */
  completedAt?: number | null;
}

type Rgb = [number, number, number];

const INK: Rgb = [23, 23, 23];
const ACCENT: Rgb = [220, 38, 38];
const SLATE: Rgb = [115, 115, 115];
const STEEL: Rgb = [82, 82, 82];
const FROST: Rgb = [229, 229, 229];
const MIST: Rgb = [245, 245, 245];

const NODE_LABEL: Record<string, string> = { depot: "Depo", flood: "Genangan", if: "Titik buang air" };

/** jspdf-autotable adds `lastAutoTable` to the document instance it draws on. */
type TableDoc = jsPDF & { lastAutoTable: { finalY: number } };

/** Right-align the header and footer cells of numeric columns, which headStyles would otherwise win. */
function alignNumeric(columns: number[]) {
  return (d: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
    if (d.section !== "body" && columns.includes(d.column.index)) d.cell.styles.halign = "right";
  };
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function stamp(ctx: ExportContext): { date: string; time: string; day: string } {
  const d = new Date(ctx.completedAt ?? Date.now());
  return {
    date: d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
    time: d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":"),
    day: d.toISOString().slice(0, 10),
  };
}

/** Litres pumped and poured out at each stop of a route (poured only at outlets). */
function stopVolumes(route: RouteOut): { pumpedL: number; pouredL: number }[] {
  return route.visits.map((v, i) => ({
    pumpedL: v.node_type === "flood" ? v.volume_pumped_l : 0,
    pouredL:
      v.node_type === "if" ? (i > 0 ? route.visits[i - 1].tank_load_after_l : route.capacity_l) : 0,
  }));
}

function routePumpedL(route: RouteOut): number {
  return stopVolumes(route).reduce((s, v) => s + v.pumpedL, 0);
}

const ALGORITHM_NAME: Record<OptimizationResult["algorithm"], string> = {
  acs: "Hybrid ACS",
  vns: "VNS",
};

export function exportReport(result: OptimizationResult, ctx: ExportContext = {}): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as TableDoc;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 16;
  const cw = pw - margin * 2;
  const when = stamp(ctx);
  const algorithm = ALGORITHM_NAME[result.algorithm];

  const label = (text: string, y: number) => {
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(text.toUpperCase(), margin, y);
  };

  // --- Masthead -------------------------------------------------------------
  doc.setFillColor(...INK);
  doc.rect(0, 0, pw, 32, "F");
  doc.setFillColor(...ACCENT);
  doc.rect(0, 32, pw, 1.2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Response", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Laporan Hasil Optimasi Rute Penyedotan Genangan", margin, 21);
  doc.setFontSize(7.5);
  doc.setTextColor(212, 212, 212);
  doc.text("Dinas Pemadam Kebakaran dan Penyelamatan Kota Surabaya", margin, 26.5);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(algorithm, pw - margin, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(212, 212, 212);
  doc.text(when.date, pw - margin, 21, { align: "right" });
  doc.text(`pukul ${when.time}`, pw - margin, 26.5, { align: "right" });

  // --- Headline figures -----------------------------------------------------
  let y = 44;
  label("Ringkasan hasil", y);
  y += 4;

  const kpis: { name: string; value: string; sub: string }[] = [
    { name: "Skor Respons (Z)", value: formatNumber(result.objective_z, 0), sub: "makin rendah makin baik" },
    {
      name: "Cakupan Pemompaan",
      value: `${formatNumber(result.coverage_pct, 1)}%`,
      sub: `${formatNumber(result.unserved_points)} titik belum tuntas`,
    },
    {
      name: "Total Jarak",
      value: formatMeters(result.total_distance_m),
      sub: `${formatNumber(result.n_vehicles)} kendaraan`,
    },
    {
      name: "Total Waktu Operasi",
      value: formatDuration(result.total_time_s),
      sub: `komputasi ${formatDuration(result.computation_time_s)}`,
    },
  ];
  const gap = 3;
  const kpiW = (cw - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + gap);
    doc.setFillColor(...MIST);
    doc.setDrawColor(...FROST);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, kpiW, 22, 1.8, 1.8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    doc.text(k.name.toUpperCase(), x + 3, y + 5.5);
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(k.value, x + 3, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    doc.text(k.sub, x + 3, y + 18.5);
  });
  y += 22 + 8;

  // --- Detail figures, two label/value pairs per row -----------------------------
  label("Rincian", y);
  y += 3;
  const facts: [string, string][] = [
    ["Algoritma", algorithm],
    ["Skor total (Z + penalti)", formatNumber(result.score, 0)],
    ["Penalti beban tersisa", formatNumber(result.penalty, 0)],
    ["Beban total", `${formatNumber(result.demand_total_l)} L`],
    ["Beban belum tuntas", `${formatNumber(result.unserved_volume_l)} L`],
    ["Iterasi dijalankan", formatNumber(result.convergence.length)],
    ["Kunjungan genangan", formatNumber(result.total_flood_visits)],
    ["Kunjungan titik buang air", formatNumber(result.total_if_visits)],
    ["Kunjungan ulang genangan", formatNumber(result.total_revisits)],
    ["Kendaraan dikerahkan", formatNumber(result.n_vehicles)],
  ];
  const factRows: RowInput[] = [];
  for (let i = 0; i < facts.length; i += 2) {
    const a = facts[i];
    const b = facts[i + 1] ?? ["", ""];
    factRows.push([a[0], a[1], b[0], b[1]]);
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: factRows,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 1, right: 1 }, textColor: INK },
    columnStyles: {
      0: { textColor: SLATE, cellWidth: cw * 0.28 },
      1: { fontStyle: "bold", halign: "right", cellWidth: cw * 0.2 },
      2: {
        textColor: SLATE,
        cellWidth: cw * 0.3,
        cellPadding: { top: 2, bottom: 2, left: 9, right: 1 },
      },
      3: { fontStyle: "bold", halign: "right", cellWidth: cw * 0.22 },
    },
    didParseCell: (d) => {
      d.cell.styles.lineColor = FROST;
      d.cell.styles.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
    },
  });
  y = doc.lastAutoTable.finalY + 9;

  // --- Reading notes ----------------------------------------------------------
  label("Catatan", y);
  y += 5;
  const notes = [
    "Skor Respons (Z) adalah jumlah dari tingkat keparahan (SI) setiap titik dikali waktu tiba kendaraan di titik itu. Makin rendah, makin cepat titik yang parah dijangkau.",
    "Beban belum tuntas dilanjutkan ke periode berikutnya dan dikenai penalti pada skor total. Cakupan pemompaan adalah bagian beban yang sudah terpompa.",
    "Waktu pada tabel kunjungan dihitung dalam menit dan detik sejak kendaraan berangkat dari depo.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...STEEL);
  for (const note of notes) {
    const lines = doc.splitTextToSize(note, cw - 4) as string[];
    doc.text("-", margin, y);
    doc.text(lines, margin + 4, y);
    y += lines.length * 3.6 + 1.5;
  }

  // --- Routes overview ------------------------------------------------------
  doc.addPage();
  y = margin + 2;
  label("Rute kendaraan", y);
  y += 3;
  const totalPumped = result.routes.reduce((s, r) => s + routePumpedL(r), 0);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Kendaraan", "Depo", "Tangki (L)", "Genangan", "Buang", "Dipompa (L)", "Jarak", "Waktu", "Z"]],
    body: result.routes.map((r) => [
      r.vehicle_id,
      r.depot_name || r.depot_id,
      formatNumber(r.capacity_l),
      formatNumber(r.visit_count_flood),
      formatNumber(r.visit_count_if),
      formatNumber(routePumpedL(r)),
      formatMeters(r.total_distance_m),
      formatDuration(r.total_time_s),
      formatNumber(r.z_contribution, 0),
    ]),
    foot: [
      [
        "Total",
        "",
        "",
        formatNumber(result.total_flood_visits),
        formatNumber(result.total_if_visits),
        formatNumber(totalPumped),
        formatMeters(result.total_distance_m),
        "",
        formatNumber(result.objective_z, 0),
      ],
    ],
    showFoot: "lastPage",
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 1.8, right: 1.8 },
      textColor: INK,
      lineColor: FROST,
      lineWidth: { bottom: 0.2, top: 0, left: 0, right: 0 },
      overflow: "linebreak",
    },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, valign: "middle" },
    footStyles: { fillColor: MIST, textColor: INK, fontStyle: "bold", lineColor: STEEL, lineWidth: { top: 0.3, bottom: 0, left: 0, right: 0 } },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 19 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 15 },
      3: { halign: "right", cellWidth: 16 },
      4: { halign: "right", cellWidth: 12 },
      5: { halign: "right", cellWidth: 20 },
      6: { halign: "right", cellWidth: 20 },
      7: { halign: "right", cellWidth: 24 },
      8: { halign: "right", cellWidth: 16 },
    },
    didParseCell: alignNumeric([2, 3, 4, 5, 6, 7, 8]),
    rowPageBreak: "avoid",
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- One section per vehicle ----------------------------------------------
  y += 4;
  if (y > ph - 60) {
    doc.addPage();
    y = margin + 2;
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Rincian Kunjungan per Kendaraan", margin, y);
  y += 7;

  for (const route of result.routes) {
    if (y > ph - 46) {
      doc.addPage();
      y = margin + 2;
    }

    const [r, g, b] = hexToRgb(ROUTE_COLORS[route.route_color_index % ROUTE_COLORS.length]);
    doc.setFillColor(r, g, b);
    doc.circle(margin + 1.6, y - 1.2, 1.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(route.vehicle_id, margin + 5.5, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(route.depot_name || route.depot_id, margin + 5.5 + doc.getTextWidth(route.vehicle_id) + 3, y);
    y += 4.6;
    doc.setFontSize(7.2);
    doc.text(
      `Tangki ${formatNumber(route.capacity_l)} L  ·  ${formatMeters(route.total_distance_m)}  ·  ${formatDuration(route.total_time_s)}  ·  ${formatNumber(routePumpedL(route))} L dipompa  ·  Z ${formatNumber(route.z_contribution, 0)}`,
      margin + 5.5,
      y,
    );
    y += 3;

    const volumes = stopVolumes(route);
    const cycles = labelCycles(route);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Siklus", "Lokasi", "Jenis", "Tiba", "Volume", "Isi tangki"]],
      body: route.visits.map((v, i) => [
        String(i + 1),
        cycleShort(cycles.stops[i], cycles.total),
        v.node_name,
        NODE_LABEL[v.node_type] ?? v.node_type,
        formatDuration(v.arrival_time_s),
        volumes[i].pumpedL > 0
          ? `+${formatNumber(volumes[i].pumpedL)} L`
          : volumes[i].pouredL > 0
            ? `-${formatNumber(volumes[i].pouredL)} L`
            : "-",
        `${formatNumber(v.tank_load_after_l)} L`,
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: { top: 1.7, bottom: 1.7, left: 1.8, right: 1.8 },
        textColor: INK,
        lineColor: FROST,
        lineWidth: { bottom: 0.15, top: 0, left: 0, right: 0 },
        overflow: "ellipsize",
      },
      headStyles: { fillColor: MIST, textColor: SLATE, fontStyle: "bold", fontSize: 6.5, lineColor: FROST },
      columnStyles: {
        0: { cellWidth: 8, halign: "right", textColor: SLATE },
        1: { cellWidth: 15, halign: "right", textColor: SLATE },
        2: { cellWidth: "auto" },
        3: { cellWidth: 26, textColor: STEEL },
        4: { cellWidth: 27, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 24, halign: "right", textColor: STEEL },
      },
      didParseCell: alignNumeric([0, 1, 4, 5, 6]),
      rowPageBreak: "avoid",
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // --- Footer on every page ---------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...FROST);
    doc.setLineWidth(0.25);
    doc.line(margin, ph - 12, pw - margin, ph - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text("Response  ·  Sistem Pendukung Keputusan Pemadam Kebakaran Kota Surabaya", margin, ph - 7.5);
    doc.text(`Halaman ${p} dari ${pages}`, pw - margin, ph - 7.5, { align: "right" });
  }

  doc.save(`laporan-optimasi-${result.algorithm}-${when.day}.pdf`);
}

/** Plan as a workbook: summary, vehicles, stops, flood points and convergence. */
export function exportExcel(result: OptimizationResult, ctx: ExportContext = {}): void {
  const when = stamp(ctx);
  const algorithm = ALGORITHM_NAME[result.algorithm];
  const note = `Dihitung ${when.date} pukul ${when.time}`;

  const section = (name: string): Cell[] => [{ v: name, f: "section" }, null, null, null];
  const metric = (name: string, value: Cell, unit: string, meaning = ""): Cell[] => [
    name,
    value,
    unit,
    meaning,
  ];

  const summary: Sheet = {
    name: "Ringkasan",
    title: `Hasil Optimasi Rute Penyedotan Genangan - ${algorithm}`,
    note,
    header: ["Metrik", "Nilai", "Satuan", "Keterangan"],
    formats: ["text", "dec2", "text", "text"],
    rows: [
      section("Hasil utama"),
      metric("Skor Respons (Z)", { v: result.objective_z, f: "int" }, "-", "Jumlah SI x waktu tiba, makin rendah makin baik"),
      metric("Penalti beban tersisa", { v: result.penalty, f: "int" }, "-", "Dikenakan pada beban yang belum terpompa"),
      metric("Skor total (Z + penalti)", { v: result.score, f: "int" }, "-", "Dasar peringkat solusi"),
      metric("Cakupan pemompaan", { v: result.coverage_pct, f: "dec1" }, "%", "Bagian beban yang sudah terpompa"),
      section("Beban pemompaan"),
      metric("Beban total", { v: Math.round(result.demand_total_l), f: "int" }, "L"),
      metric("Beban belum tuntas", { v: Math.round(result.unserved_volume_l), f: "int" }, "L", "Dilanjutkan ke periode berikutnya"),
      metric("Titik belum tuntas", { v: result.unserved_points, f: "int" }, "titik"),
      section("Operasional"),
      metric("Kendaraan dikerahkan", { v: result.n_vehicles, f: "int" }, "unit"),
      metric("Total jarak", { v: result.total_distance_m / 1000, f: "dec1" }, "km"),
      metric("Total waktu operasi", { v: result.total_time_s / 3600, f: "dec2" }, "jam", "Jumlah waktu semua kendaraan"),
      metric("Kunjungan genangan", { v: result.total_flood_visits, f: "int" }, "kali"),
      metric("Kunjungan titik buang air", { v: result.total_if_visits, f: "int" }, "kali"),
      metric("Kunjungan ulang genangan", { v: result.total_revisits, f: "int" }, "kali"),
      section("Komputasi"),
      metric("Algoritma", algorithm, "-"),
      metric("Iterasi dijalankan", { v: result.convergence.length, f: "int" }, "iterasi"),
      metric("Waktu komputasi", { v: result.computation_time_s, f: "dec1" }, "detik"),
    ],
  };

  const routes: Sheet = {
    name: "Rute",
    title: "Rute per Kendaraan",
    note,
    header: [
      "Kendaraan",
      "Depo",
      "Tangki (L)",
      "Kunjungan genangan",
      "Kunjungan titik buang",
      "Dipompa (L)",
      "Jarak (km)",
      "Waktu (menit)",
      "Kontribusi Z",
      "Porsi Z (%)",
    ],
    formats: ["text", "text", "int", "int", "int", "int", "dec2", "dec1", "int", "dec1"],
    filter: true,
    rows: [
      ...result.routes.map((r): Cell[] => [
        r.vehicle_id,
        r.depot_name || r.depot_id,
        r.capacity_l,
        r.visit_count_flood,
        r.visit_count_if,
        Math.round(routePumpedL(r)),
        r.total_distance_m / 1000,
        r.total_time_s / 60,
        r.z_contribution,
        result.objective_z > 0 ? (r.z_contribution / result.objective_z) * 100 : null,
      ]),
      [
        { v: "Total", f: "total-text" },
        { v: null, f: "total-text" },
        { v: null, f: "total-int" },
        { v: result.total_flood_visits, f: "total-int" },
        { v: result.total_if_visits, f: "total-int" },
        { v: Math.round(result.routes.reduce((s, r) => s + routePumpedL(r), 0)), f: "total-int" },
        { v: result.total_distance_m / 1000, f: "total-dec2" },
        { v: result.total_time_s / 60, f: "total-dec1" },
        { v: result.objective_z, f: "total-int" },
        { v: null, f: "total-dec1" },
      ],
    ],
  };

  const stopRows: Cell[][] = [];
  for (const r of result.routes) {
    const volumes = stopVolumes(r);
    const cycles = labelCycles(r);
    r.visits.forEach((v, i) => {
      const stop = cycles.stops[i];
      stopRows.push([
        r.vehicle_id,
        r.depot_name || r.depot_id,
        i + 1,
        stop.final ? "Akhir" : stop.cycle,
        NODE_LABEL[v.node_type] ?? v.node_type,
        v.node_name,
        v.node_id,
        v.arrival_time_s / 60,
        Math.round(volumes[i].pumpedL),
        Math.round(volumes[i].pouredL),
        Math.round(v.tank_load_after_l),
      ]);
    });
  }
  const stops: Sheet = {
    name: "Kunjungan",
    title: "Urutan Kunjungan per Kendaraan",
    note,
    header: [
      "Kendaraan",
      "Depo",
      "Urutan",
      "Siklus",
      "Jenis",
      "Lokasi",
      "ID lokasi",
      "Tiba (menit)",
      "Dipompa (L)",
      "Dibuang (L)",
      "Isi tangki (L)",
    ],
    formats: ["text", "text", "int", "int", "text", "text", "text", "dec1", "int", "int", "int"],
    filter: true,
    rows: stopRows,
  };

  const floods = new Map<
    string,
    { name: string; visits: number; vehicles: Set<string>; pumpedL: number; first: number; last: number }
  >();
  for (const r of result.routes) {
    for (const v of r.visits) {
      if (v.node_type !== "flood") continue;
      const f = floods.get(v.node_id) ?? {
        name: v.node_name,
        visits: 0,
        vehicles: new Set<string>(),
        pumpedL: 0,
        first: Infinity,
        last: -Infinity,
      };
      f.visits += 1;
      f.vehicles.add(r.vehicle_id);
      f.pumpedL += v.volume_pumped_l;
      f.first = Math.min(f.first, v.arrival_time_s);
      f.last = Math.max(f.last, v.arrival_time_s);
      floods.set(v.node_id, f);
    }
  }
  const perFlood: Sheet = {
    name: "Per Genangan",
    title: "Pelayanan per Titik Genangan",
    note,
    header: [
      "Titik",
      "ID titik",
      "Jumlah kunjungan",
      "Kendaraan berbeda",
      "Dipompa (L)",
      "Tiba pertama (menit)",
      "Tiba terakhir (menit)",
    ],
    formats: ["text", "text", "int", "int", "int", "dec1", "dec1"],
    filter: true,
    rows: [...floods.entries()]
      .sort((a, b) => a[1].first - b[1].first)
      .map(([id, f]): Cell[] => [
        f.name,
        id,
        f.visits,
        f.vehicles.size,
        Math.round(f.pumpedL),
        f.first / 60,
        f.last / 60,
      ]),
  };

  const convergence: Sheet = {
    name: "Konvergensi",
    title: "Perkembangan Skor per Iterasi",
    note: `${note}. Skor = Z + penalti, makin rendah makin baik.`,
    header: ["Iterasi", "Skor terbaik", "Skor terbaik iterasi ini"],
    formats: ["int", "int", "int"],
    rows: result.convergence.map((c): Cell[] => [c.iteration, c.best_score, c.iter_best_score]),
  };

  downloadXlsx(`optimasi-${result.algorithm}-${when.day}.xlsx`, [
    summary,
    routes,
    stops,
    perFlood,
    convergence,
  ]);
}
