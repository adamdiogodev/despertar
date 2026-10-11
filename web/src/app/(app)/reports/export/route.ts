import type { NextRequest } from "next/server";
import { requireRole, MANAGER_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, localDateKey } from "@/lib/format";
import {
  REPORT_SELECT,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  buildCsv,
  filterReports,
  parseStatus,
  type ReportRow,
} from "@/components/reports/report-utils";

// GET /reports/export?tab=&q=&therapist= — CSV of the same filtered list the page shows.
// Rows come through the user's client, so RLS limits a therapist to their own reports.
export async function GET(request: NextRequest) {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const search = request.nextUrl.searchParams;
  const status = parseStatus(search.get("tab") ?? undefined);
  const therapistId = MANAGER_ROLES.includes(user.role) ? search.get("therapist") || undefined : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").select(REPORT_SELECT).order("due_date", { ascending: true, nullsFirst: false });
  if (error) return new Response("Falha ao exportar.", { status: 500 });

  const rows = filterReports((data ?? []) as unknown as ReportRow[], { status, q: search.get("q") ?? undefined, therapistId });
  const csv = buildCsv(
    ["Paciente", "Terapeuta", "Tipo", "Referência", "Prazo", "Status", "Enviado em", "Revisado em", "Revisor", "Motivo da devolução"],
    rows.map((r) => [
      r.patient?.full_name ?? "",
      r.therapist?.profile?.full_name ?? "",
      REPORT_TYPE_LABELS[r.report_type],
      r.reference_label,
      r.due_date ? formatDate(r.due_date) : "",
      REPORT_STATUS_LABELS[r.status],
      r.submitted_at ? formatDate(r.submitted_at) : "",
      r.reviewed_at ? formatDate(r.reviewed_at) : "",
      r.reviewer?.full_name ?? "",
      r.return_reason ?? "",
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorios-${status}-${localDateKey(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
