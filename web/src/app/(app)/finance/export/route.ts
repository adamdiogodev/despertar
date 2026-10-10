import type { NextRequest } from "next/server";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildCsv, centsToCsv, csvResponse } from "@/lib/csv";
import { formatDate, localDateKey } from "@/lib/format";
import { CHARGE_STATUS_META, chargeDisplayStatus, monthBounds } from "@/components/finance/logic";

// GET /finance/export?month=YYYY-MM&status=… — charges as the signed-in manager sees them (RLS).
export async function GET(request: NextRequest) {
  await requireRole(MANAGER_ROLES);
  const today = localDateKey(new Date());
  const monthParam = request.nextUrl.searchParams.get("month") ?? "";
  const month = monthBounds(monthParam) ? monthParam : today.slice(0, 7);
  const bounds = monthBounds(month)!;
  const status = request.nextUrl.searchParams.get("status") ?? "all";

  const supabase = await createClient();
  let query = supabase
    .from("charges")
    .select("reference, amount_cents, due_date, payment_method, status, paid_at, family:families(name)")
    .order("due_date");
  // Overdue spans every month, as on the page.
  if (status !== "overdue") query = query.gte("due_date", bounds.start).lte("due_date", bounds.end);
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
    ]);

  const csv = buildCsv(["Família", "Referência", "Valor (R$)", "Vencimento", "Forma", "Status", "Pago em"], rows);
  return csvResponse(`cobrancas-${month}.csv`, csv);
}
