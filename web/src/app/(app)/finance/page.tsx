import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, buttonClass } from "@/components/ui/primitives";
import { ActionButton } from "@/components/finance/action-button";
import { NewChargeModal } from "@/components/finance/new-charge-modal";
import {
  CHARGE_STATUS_META,
  INVOICE_STATUS_META,
  chargeDisplayStatus,
  monthBounds,
  summarizeCharges,
  type ChargeDisplayStatus,
  type InvoiceStatus,
} from "@/components/finance/logic";
import { cancelCharge, createCharge, markChargePaid } from "./actions";

const STATUS_FILTERS: { key: ChargeDisplayStatus | "all"; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "overdue", label: "Atrasadas" },
  { key: "awaiting_insurance", label: "Aguard. convênio" },
  { key: "paid", label: "Pagas" },
  { key: "canceled", label: "Canceladas" },
];

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  await requireRole(MANAGER_ROLES);
  const params = await searchParams;
  const today = localDateKey(new Date());
  const monthParam = typeof params.month === "string" ? params.month : "";
  const month = monthBounds(monthParam) ? monthParam : today.slice(0, 7);
  const bounds = monthBounds(month)!;
  const statusParam = typeof params.status === "string" ? params.status : "all";
  const status = STATUS_FILTERS.some((f) => f.key === statusParam) ? (statusParam as ChargeDisplayStatus | "all") : "all";

  const supabase = await createClient();
  const [chargesRes, familiesRes, invoicesRes] = await Promise.all([
    supabase
      .from("charges")
      .select("id, family_id, reference, amount_cents, due_date, payment_method, status, paid_at, family:families(name)")
      .order("due_date", { ascending: false }),
    supabase.from("families").select("id, name").neq("status", "inactive").order("name"),
    supabase.from("invoice_requests").select("status, amount_cents"),
  ]);
  const charges = chargesRes.data ?? [];
  const kpis = summarizeCharges(charges, bounds, today);

  // Overdue charges are listed across every month, matching the delinquency KPI.
  const visible = charges
    .filter((c) => status === "overdue" || (c.due_date >= bounds.start && c.due_date <= bounds.end))
    .map((c) => ({ ...c, display: chargeDisplayStatus(c.status, c.due_date, today) }))
    .filter((c) => status === "all" || c.display === status);

  const payouts = new Map<InvoiceStatus, { count: number; cents: number }>();
  for (const invoice of invoicesRes.data ?? []) {
    const entry = payouts.get(invoice.status) ?? { count: 0, cents: 0 };
    entry.count += 1;
    entry.cents += invoice.amount_cents;
    payouts.set(invoice.status, entry);
  }

  const query = (next: { month?: string; status?: string }) => {
    const search = new URLSearchParams({ month: next.month ?? month, status: next.status ?? status });
    if (search.get("status") === "all") search.delete("status");
    return `/finance?${search.toString()}`;
  };
  const exportHref = `/finance/export?${new URLSearchParams({ month, status }).toString()}`;
  const monthLabel = new Date(`${bounds.start}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Cobranças às famílias, repasses aos terapeutas e indicadores"
        actions={
          <>
            <LinkButton href="/finance/reports" variant="ghost" size="sm">
              Relatório de terapias
            </LinkButton>
            <LinkButton href="/finance/invoices" variant="ghost" size="sm">
              Notas fiscais
            </LinkButton>
            <a href={exportHref} className={buttonClass("outline", "sm")} data-testid="charges-export">
              ↓ Exportar CSV
            </a>
            <NewChargeModal families={familiesRes.data ?? []} action={createCharge} defaultDueDate={today} />
          </>
        }
      />

      {chargesRes.error && <Alert tone="red">Não foi possível carregar as cobranças.</Alert>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Cobrado · ${monthLabel}`} value={formatCents(kpis.billedCents)} tone="green" hint="Cobranças com vencimento no mês" />
        <StatCard
          label="Recebido"
          value={formatCents(kpis.receivedCents)}
          tone="blue"
          hint={kpis.billedCents ? `${Math.round((kpis.receivedCents / kpis.billedCents) * 100)}% do cobrado` : "—"}
        />
        <StatCard label="A receber de convênio" value={formatCents(kpis.insuranceCents)} tone="yellow" />
        <StatCard
          label="Inadimplência"
          value={formatCents(kpis.overdueCents)}
          tone="red"
          hint={`${kpis.overdueFamilies} ${kpis.overdueFamilies === 1 ? "família" : "famílias"} em atraso (todos os meses)`}
          href={query({ status: "overdue" })}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-sm font-bold text-t1">Cobranças às famílias</h2>
            <form className="flex items-center gap-2" action="/finance">
              <input type="month" name="month" defaultValue={month} className="rounded-lg border-[1.5px] border-line px-2 py-1 text-sm" aria-label="Mês" />
              {status !== "all" && <input type="hidden" name="status" value={status} />}
              <button className={buttonClass("ghost", "sm")}>Filtrar</button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2 px-5 py-3">
            {STATUS_FILTERS.map((filter) => (
              <Link
                key={filter.key}
                href={query({ status: filter.key })}
                className={buttonClass(filter.key === status ? "primary" : "ghost", "sm")}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          {visible.length === 0 ? (
            <EmptyState title="Nenhuma cobrança" description="Não há cobranças com esse filtro no mês selecionado." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Família</Th>
                  <Th>Referência</Th>
                  <Th>Valor</Th>
                  <Th>Vencimento</Th>
                  <Th>Forma</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((charge) => {
                  const meta = CHARGE_STATUS_META[charge.display];
                  const open = charge.status === "pending" || charge.status === "awaiting_insurance";
                  return (
                    <tr key={charge.id} data-testid="charge-row">
                      <Td className="font-semibold text-t1">{charge.family?.name ?? "—"}</Td>
                      <Td>{charge.reference}</Td>
                      <Td className="font-bold text-t1">{formatCents(charge.amount_cents)}</Td>
                      <Td>{formatDate(charge.due_date)}</Td>
                      <Td>{charge.payment_method}</Td>
                      <Td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {charge.paid_at && <div className="mt-1 text-[11px] text-t3">em {formatDate(charge.paid_at)}</div>}
                      </Td>
                      <Td>
                        {open ? (
                          <div className="flex gap-2">
                            <ActionButton action={markChargePaid} fields={{ id: charge.id }} label="Marcar paga" variant="success" testId="charge-mark-paid" />
                            <ActionButton
                              action={cancelCharge}
                              fields={{ id: charge.id }}
                              label="Cancelar"
                              confirmMessage="Cancelar esta cobrança?"
                              testId="charge-cancel"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-t3">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle action={<Link href="/finance/invoices" className="text-xs font-semibold text-primary">Ver períodos</Link>}>
            Repasses de terapeutas
          </CardTitle>
          {payouts.size === 0 ? (
            <p className="text-sm text-t2">Nenhuma solicitação de nota fiscal gerada ainda.</p>
          ) : (
            <div>
              {(Object.keys(INVOICE_STATUS_META) as InvoiceStatus[]).map((key) => {
                const entry = payouts.get(key);
                if (!entry) return null;
                return (
                  <div key={key} className="flex items-center justify-between border-b border-line-light py-2.5 text-sm last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={INVOICE_STATUS_META[key].tone}>{INVOICE_STATUS_META[key].label}</Badge>
                      <span className="text-xs text-t3">{entry.count}</span>
                    </div>
                    <span className="font-bold text-t1">{formatCents(entry.cents)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
