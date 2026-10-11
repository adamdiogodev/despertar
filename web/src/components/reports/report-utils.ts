import type { Database } from "@/lib/database.types";

export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type ReportType = Database["public"]["Enums"]["report_type"];

export const REPORT_STATUSES: ReportStatus[] = ["pending", "in_review", "approved", "returned"];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pendente",
  in_review: "Em revisão",
  approved: "Aprovado",
  returned: "Devolvido",
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  evaluation: "Avaliação",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  school: "Escolar",
  other: "Outro",
};

export type ReportRow = {
  id: string;
  report_type: ReportType;
  reference_label: string;
  due_date: string | null;
  status: ReportStatus;
  file_path: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  return_reason: string | null;
  created_at: string;
  therapist_id: string;
  patient: { full_name: string } | null;
  therapist: { profile: { full_name: string } | null } | null;
  reviewer: { full_name: string } | null;
};

// Column list shared by the page and the CSV export so both see the same rows.
export const REPORT_SELECT =
  "id, report_type, reference_label, due_date, status, file_path, submitted_at, reviewed_at, return_reason, created_at, therapist_id, " +
  "patient:patients(full_name), therapist:therapists(profile:profiles(full_name)), reviewer:profiles!reports_reviewed_by_fkey(full_name)";

export function parseStatus(value: string | undefined): ReportStatus {
  return REPORT_STATUSES.includes(value as ReportStatus) ? (value as ReportStatus) : "pending";
}

export function filterReports(rows: ReportRow[], filters: { status?: ReportStatus; q?: string; therapistId?: string }) {
  const q = filters.q?.trim().toLocaleLowerCase("pt-BR");
  return rows.filter(
    (row) =>
      (!filters.status || row.status === filters.status) &&
      (!filters.therapistId || row.therapist_id === filters.therapistId) &&
      (!q || (row.patient?.full_name ?? "").toLocaleLowerCase("pt-BR").includes(q)),
  );
}

// Deadline only matters while the therapist still owes the report.
export function deadlineState(row: Pick<ReportRow, "status" | "due_date">, today: string): "overdue" | "urgent" | null {
  if (!row.due_date || (row.status !== "pending" && row.status !== "returned")) return null;
  if (row.due_date < today) return "overdue";
  const diffDays = (Date.parse(`${row.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return diffDays <= 3 ? "urgent" : null;
}

// First day (YYYY-MM-DD) of the quarter that contains `today` (YYYY-MM-DD).
export function quarterStart(today: string): string {
  const [year, month] = today.split("-").map(Number);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

// Semicolon-separated CSV (what Excel pt-BR expects), with a BOM for UTF-8.
export function buildCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  // Neutralise spreadsheet formulas (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
