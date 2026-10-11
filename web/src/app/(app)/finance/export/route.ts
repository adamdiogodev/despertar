import type { NextRequest } from "next/server";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildCsv, centsToCsv, csvResponse } from "@/lib/csv";
import { formatDate, localDateKey } from "@/lib/format";
import { CHARGE_STATUS_META, chargeDisplayStatus, monthBounds } from "@/components/finance/logic";

// GET /finance/export?month=YYYY-MM&status=…&family=… — charges as the signed-in manager sees them (RLS).
export async function GET(request: NextRequest) {
  await requireRole(MANAGER_ROLES);
  const today = localDateKey(new Date());
  const monthParam = request.nextUrl.searchParams.get("month") ?? "";
  const month = monthBounds(monthParam) ? monthParam : today.slice(0, 7);
  const bounds = monthBounds(month)!;
  const status = request.nextUrl.searchParams.get("status") ?? "all";
  const family = request.nextUrl.searchParams.get("family") ?? "";
  const familyId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(family) ? family : null;

  const supabase = await createClient();
  let query = supabase
    .from("charges")
    .select("reference, amount_cents, due_date, payment_method, status, paid_at, receipt_path, family:families(name)")
    .order("due_date");
  // As on the page: a family exports its whole history; overdue spans every month.
  if (familyId) query = query.eq("family_id", familyId);
  else if (status !== "overdue") query = query.gte("due_date", bounds.start).lte("due_date", bounds.end);
  const { data, error } = await query;
  if (error) return new Response("Falha ao exportar", { status: 500 });

  const rows = data
    .map((c) => ({ ...c, display: chargeDisplayStatus(c.status, c.due_date, today) }))
    .filter((c) => status === "all" || c.display === status)
    .map((c) => [
      c.family?.name ?? "",
      c.reference,
      centsToCsv(c.amount_cents),
      formatDate(c.due_date),
      c.payment_method,
      CHARGE_STATUS_META[c.display].label,
      c.paid_at ? formatDate(c.paid_at) : "",
      c.receipt_path ? "Sim" : "Não",
    ]);

  const csv = buildCsv(["Família", "Referência", "Valor (R$)", "Vencimento", "Forma", "Status", "Pago em", "Comprovante"], rows);
  return csvResponse(familyId ? `cobrancas-familia-${today}.csv` : `cobrancas-${month}.csv`, csv);
}
