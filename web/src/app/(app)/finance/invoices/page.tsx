import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { NewPeriodModal } from "@/components/finance/invoice-admin-forms";
import { createPeriod } from "./actions";

export default async function InvoicePeriodsPage() {
  const user = await requireRole(MANAGER_ROLES);
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const [periodsRes, requestsRes] = await Promise.all([
    supabase.from("payout_periods").select("id, label, starts_on, ends_on, status").order("starts_on", { ascending: false }),
    supabase.from("invoice_requests").select("period_id, status, amount_cents"),
  ]);

  const totals = new Map<string, { count: number; cents: number; paidCents: number; awaiting: number }>();
  for (const request of requestsRes.data ?? []) {
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
    <div>
      <PageHeader
        title="Notas fiscais dos terapeutas"
        description="Períodos de fechamento, solicitações de NF e repasses"
        actions={
          <>
            <LinkButton href="/finance" variant="ghost" size="sm">
              ← Financeiro
            </LinkButton>
            {isAdmin && <NewPeriodModal action={createPeriod} defaultStart={`${today.slice(0, 7)}-01`} defaultEnd={today} />}
          </>
        }
      />
      {!isAdmin && <Alert tone="blue">Visualização somente leitura. Apenas o administrador gera e confere as notas.</Alert>}

      <Card className="p-0">
        {periods.length === 0 ? (
          <EmptyState title="Nenhum período" description="Crie um período de fechamento para gerar as solicitações de nota fiscal." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Período</Th>
                <Th>Datas</Th>
                <Th>Status</Th>
                <Th>Solicitações</Th>
                <Th>Total</Th>
                <Th>Pago</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const total = totals.get(period.id);
                return (
                  <tr key={period.id} data-testid="period-row">
                    <Td className="font-semibold text-t1">
                      <Link href={`/finance/invoices/${period.id}`} className="hover:text-primary">
                        {period.label}
                      </Link>
                    </Td>
                    <Td>
                      {formatDate(period.starts_on)} a {formatDate(period.ends_on)}
                    </Td>
                    <Td>
                      <Badge tone={period.status === "open" ? "green" : "gray"}>{period.status === "open" ? "Aberto" : "Fechado"}</Badge>
                    </Td>
                    <Td>
                      {total?.count ?? 0}
                      {total?.awaiting ? <span className="ml-2 text-xs font-semibold text-info">{total.awaiting} para conferir</span> : null}
                    </Td>
                    <Td className="font-bold text-t1">{formatCents(total?.cents ?? 0)}</Td>
                    <Td>{formatCents(total?.paidCents ?? 0)}</Td>
                    <Td>
                      <LinkButton href={`/finance/invoices/${period.id}`} variant="outline" size="sm">
                        Abrir
                      </LinkButton>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
