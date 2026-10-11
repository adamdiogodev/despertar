import type { NextRequest } from "next/server";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { buildCsv, centsToCsv, csvResponse } from "@/lib/csv";
import { loadTherapyReport, reportRange } from "@/components/finance/therapy-report";

// GET /finance/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  await requireRole(MANAGER_ROLES);
  const { from, to } = reportRange(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"));
  const rows = await loadTherapyReport(from, to);

  const csv = buildCsv(
    ["Terapeuta", "Terapia", "Concluídas", "Faltas", "Canceladas", "Minutos realizados", "Valor estimado (R$)", "Observação"],
    rows.map((r) => [
      r.therapistName,
      r.therapyName,
      r.completed,
      r.noShow,
      r.canceled,
      r.completedMinutes,
      centsToCsv(r.estimatedCents),
      r.missingRate ? "Sem valor cadastrado" : "",
    ]),
  );
  return csvResponse(`relatorio-terapias-${from}-a-${to}.csv`, csv);
}
