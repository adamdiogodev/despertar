import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, localDateKey } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { FinanceTabs, ProfessionalsSubnav } from "@/components/finance/finance-tabs";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { NewPeriodModal } from "@/components/finance/invoice-admin-forms";
import { createPeriod } from "./actions";

export default async function InvoicePeriodsPage() {
  await requireRole(MANAGER_ROLES);
  const supabase = await createClient();
  const [periodsRes, requestsRes] = await Promise.all([
    supabase.from("payout_periods").select("id, label, starts_on, ends_on, status").order("starts_on", { ascending: false }),
    supabase.from("invoice_requests").select("period_id, status, amount_cents"),
  ]);

  const totals = new Map<string, { count: number; cents: number; paidCents: number; awaiting: number }>();
  for (const request of requestsRes.data ?? []) {
    if (!request.period_id) continue; // manual requests live in the professionals view
    const entry = totals.get(request.period_id) ?? { count: 0, cents: 0, paidCents: 0, awaiting: 0 };
    entry.count += 1;
    entry.cents += request.amount_cents;
    if (request.status === "paid") entry.paidCents += request.amount_cents;
    if (request.status === "submitted") entry.awaiting += 1;
    totals.set(request.period_id, entry);
  }

  const today = localDateKey(new Date());
  const periods = periodsRes.data ?? [];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Financeiro"
        description="NF por período de sessões: fechamento, solicitações e repasses"
        actions={<NewPeriodModal action={createPeriod} defaultStart={`${today.slice(0, 7)}-01`} defaultEnd={today} />}
      />
      <FinanceTabs active="professionals" />
      <ProfessionalsSubnav active="periods" />

      <Card className="min-w-0 p-0">
        {periods.length === 0 ? (
          <EmptyState title="Nenhum período" description="Crie um período de fechamento para gerar as solicitações de nota fiscal." />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Período</RTh>
                <RTh>Datas</RTh>
                <RTh>Status</RTh>
                <RTh>Solicitações</RTh>
                <RTh>Total</RTh>
                <RTh>Pago</RTh>
                <RTh />
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const total = totals.get(period.id);
                return (
                  <tr key={period.id} data-testid="period-row">
                    <RTd className="font-semibold text-t1">
                      <Link href={`/finance/invoices/${period.id}`} className="hover:text-primary">
                        {period.label}
                      </Link>
                    </RTd>
                    <RTd label="Datas">
                      {formatDate(period.starts_on)} a {formatDate(period.ends_on)}
                    </RTd>
                    <RTd label="Status">
                      <Badge tone={period.status === "open" ? "green" : "gray"}>{period.status === "open" ? "Aberto" : "Fechado"}</Badge>
                    </RTd>
                    <RTd label="Solicitações">
                      {total?.count ?? 0}
                      {total?.awaiting ? <span className="ml-2 text-xs font-semibold text-info">{total.awaiting} para conferir</span> : null}
                    </RTd>
                    <RTd label="Total" className="font-bold text-t1">
                      {formatCents(total?.cents ?? 0)}
                    </RTd>
                    <RTd label="Pago">{formatCents(total?.paidCents ?? 0)}</RTd>
                    <RTd>
                      <LinkButton href={`/finance/invoices/${period.id}`} variant="outline" size="sm">
                        Abrir
                      </LinkButton>
                    </RTd>
                  </tr>
                );
              })}
            </tbody>
          </RTable>
        )}
      </Card>
    </div>
  );
}
