import { strToU8, zipSync } from "fflate";

/**
 * Minimal .xlsx writer: a zip of a few XML parts, no third-party spreadsheet
 * library. Each sheet is an optional title and note, a bold header row that stays
 * in view, and body cells with number formats, light row rules and an optional
 * filter. Column widths follow the content.
 */

export type Format =
  | "text"
  | "int"
  | "dec1"
  | "dec2"
  | "section"
  | "total-text"
  | "total-int"
  | "total-dec1"
  | "total-dec2";

export type Cell = string | number | null | { v: string | number | null; f: Format };

export interface Sheet {
  /** Excel limits sheet names to 31 characters and forbids []:*?/\ */
  name: string;
  title?: string;
  note?: string;
  header: string[];
  rows: Cell[][];
  /** Default format per column; numbers fall back to int or two decimals. */
  formats?: Format[];
  /** Add a filter dropdown to every header cell. */
  filter?: boolean;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // XML 1.0 cannot carry most control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// Index into cellXfs in STYLES_XML.
const STYLE: Record<Format | "header" | "title" | "note", number> = {
  header: 1,
  title: 2,
  note: 3,
  text: 4,
  int: 5,
  dec1: 6,
  dec2: 7,
  section: 8,
  "total-text": 9,
  "total-int": 10,
  "total-dec1": 11,
  "total-dec2": 12,
};

function resolve(
  cell: Cell,
  column: Format | undefined,
): { value: string | number | null; f: Format } {
  if (cell !== null && typeof cell === "object") return { value: cell.v, f: cell.f };
  if (typeof cell === "number") {
    return { value: cell, f: column ?? (Number.isInteger(cell) ? "int" : "dec2") };
  }
  return { value: cell, f: column === "total-text" ? "total-text" : "text" };
}

function displayLength(value: string | number | null): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    return value.toLocaleString("id-ID", { maximumFractionDigits: 2 }).length;
  }
  return value.length;
}

function sheetXml(sheet: Sheet): string {
  const { header, rows, formats = [] } = sheet;
  const lastCol = Math.max(header.length, ...rows.map((r) => r.length)) - 1;

  const widths: number[] = [];
  const bump = (c: number, len: number) => {
    widths[c] = Math.max(widths[c] ?? 8, Math.min(len + 2, 60));
  };
  header.forEach((h, c) => bump(c, Math.ceil(h.length * 1.1)));
  rows.forEach((row) =>
    row.forEach((cell, c) => {
      const { value, f } = resolve(cell, formats[c]);
      // Section bands hold a label that may overflow into the empty cells beside it.
      if (f !== "section") bump(c, displayLength(value));
    }),
  );
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  const out: string[] = [];
  let r = 0;
  const textCell = (c: number, row: number, text: string, style: number) =>
    `<c r="${columnLetter(c)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;

  if (sheet.title) {
    r++;
    out.push(
      `<row r="${r}" ht="24" customHeight="1">${textCell(0, r, sheet.title, STYLE.title)}</row>`,
    );
  }
  if (sheet.note) {
    r++;
    out.push(`<row r="${r}">${textCell(0, r, sheet.note, STYLE.note)}</row>`);
  }
  if (sheet.title || sheet.note) r++; // blank spacer row

  r++;
  const headerRow = r;
  out.push(
    `<row r="${r}" ht="30" customHeight="1">` +
      header.map((h, c) => textCell(c, r, h, STYLE.header)).join("") +
      `</row>`,
  );

  for (const row of rows) {
    r++;
    const rowNo = r;
    const cells = Array.from({ length: lastCol + 1 }, (_, c) => {
      const { value, f } = resolve(row[c] ?? null, formats[c]);
      const ref = `${columnLetter(c)}${rowNo}`;
      if (value == null || value === "") {
        // Keep the style so section bands and total rules run across empty cells.
        return f === "section" || f.startsWith("total") ? `<c r="${ref}" s="${STYLE[f]}"/>` : "";
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? `<c r="${ref}" s="${STYLE[f]}"><v>${value}</v></c>` : "";
      }
      return textCell(c, rowNo, value, STYLE[f]);
    }).join("");
    out.push(`<row r="${rowNo}">${cells}</row>`);
  }

  const filter =
    sheet.filter && rows.length > 0
      ? `<autoFilter ref="A${headerRow}:${columnLetter(lastCol)}${r}"/>`
      : "";

  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">` +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${out.join("")}</sheetData>${filter}</worksheet>`
  );
}

const font = (inner: string) => `<font>${inner}<name val="Calibri"/></font>`;
const xf = (numFmtId: number, fontId: number, fillId: number, borderId: number, align: string) =>
  `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" ` +
  `applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
  `<alignment ${align}/></xf>`;

const MIDDLE = 'vertical="center"';

const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0"/></numFmts>` +
  `<fonts count="5">` +
  font('<sz val="11"/>') +
  font('<b/><sz val="11"/>') +
  font('<b/><sz val="11"/><color rgb="FFFFFFFF"/>') +
  font('<b/><sz val="15"/>') +
  font('<i/><sz val="10"/><color rgb="FF737373"/>') +
  `</fonts>` +
  `<fills count="4"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF171717"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF5F5F5"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E5E5"/></bottom><diagonal/></border>` +
  `<border><left/><right/><top style="thin"><color rgb="FF737373"/></top><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="13">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0 default
  xf(0, 2, 2, 0, 'horizontal="center" vertical="center" wrapText="1"') + // 1 header
  xf(0, 3, 0, 0, MIDDLE) + // 2 title
  xf(0, 4, 0, 0, MIDDLE) + // 3 note
  xf(0, 0, 0, 1, MIDDLE) + // 4 text
  xf(3, 0, 0, 1, MIDDLE) + // 5 int
  xf(164, 0, 0, 1, MIDDLE) + // 6 one decimal
  xf(4, 0, 0, 1, MIDDLE) + // 7 two decimals
  xf(0, 1, 3, 1, MIDDLE) + // 8 section band
  xf(0, 1, 0, 2, MIDDLE) + // 9 total text
  xf(3, 1, 0, 2, MIDDLE) + // 10 total int
  xf(164, 1, 0, 2, MIDDLE) + // 11 total one decimal
  xf(4, 1, 0, 2, MIDDLE) + // 12 total two decimals
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: safeSheetName(s.name, used) }));
  const n = named.length;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        named
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        named
          .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">` +
        named
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${REL_TYPE}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${n + 1}" Type="${REL_TYPE}/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  named.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });

  return zipSync(files);
}

export function downloadXlsx(filename: string, sheets: Sheet[]): void {
  const bytes = buildXlsx(sheets);
  // Copy into a plain ArrayBuffer-backed view so Blob accepts it under strict typing.
  const blob = new Blob([new Uint8Array(bytes)], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
