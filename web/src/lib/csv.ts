// CSV tuned for Excel pt-BR: ";" as separator (comma is the decimal mark),
// CRLF line endings and a UTF-8 BOM so accents render correctly.
export type CsvValue = string | number | null | undefined;

const BOM = "﻿";

function escapeCell(value: CsvValue): string {
  if (value == null) return "";
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(";"));
  return BOM + lines.join("\r\n") + "\r\n";
}

// 123456 → "1234,56" (plain number Excel pt-BR sums; no currency symbol).
export function centsToCsv(cents: number | null | undefined): string {
  if (cents == null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function csvResponse(fileName: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
