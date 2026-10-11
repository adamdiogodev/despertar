import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui/primitives";
import { ChargeStatusForm } from "@/components/finance/charge-status-form";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { FileLink } from "@/components/finance/invoice-request-actions";
import { NewChargeModal } from "@/components/finance/new-charge-modal";
import { ReceiptModal } from "@/components/finance/receipt-modal";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import {
  CHARGE_STATUS_META,
  chargeDisplayStatus,
  familyBalances,
  monthBounds,
  summarizeCharges,
  type ChargeDisplayStatus,
} from "@/components/finance/logic";
import { attachChargeReceipt, createCharge, setChargeStatus } from "./actions";

const STATUS_FILTERS: { key: ChargeDisplayStatus | "all"; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "overdue", label: "Atrasadas" },
  { key: "awaiting_insurance", label: "Aguard. convênio" },
  { key: "paid", label: "Pagas" },
  { key: "canceled", label: "Canceladas" },
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  await requireRole(MANAGER_ROLES);
  const params = await searchParams;
  const today = localDateKey(new Date());
  const monthParam = typeof params.month === "string" ? params.month : "";
  const month = monthBounds(monthParam) ? monthParam : today.slice(0, 7);
  const bounds = monthBounds(month)!;
  const statusParam = typeof params.status === "string" ? params.status : "all";
  const status = STATUS_FILTERS.some((f) => f.key === statusParam) ? (statusParam as ChargeDisplayStatus | "all") : "all";
  const familyId = typeof params.family === "string" && GUID.test(params.family) ? params.family : "";

  const supabase = await createClient();
  const [chargesRes, familiesRes] = await Promise.all([
    supabase
      .from("charges")
      .select("id, family_id, reference, amount_cents, due_date, payment_method, status, paid_at, receipt_path, receipt_uploaded_at, family:families(name)")
      .order("due_date", { ascending: false }),
    supabase.from("families").select("id, name, status").order("name"),
  ]);
  const charges = chargesRes.data ?? [];
  const families = familiesRes.data ?? [];
  const kpis = summarizeCharges(charges, bounds, today);
  const balances = familyBalances(charges, today);
  const selectedFamily = families.find((f) => f.id === familyId) ?? null;
  const familyBalance = selectedFamily ? balances.get(selectedFamily.id) : undefined;

  // A selected family shows its whole history; otherwise the month (overdue spans every month).
  const visible = charges
    .filter((c) => (selectedFamily ? c.family_id === selectedFamily.id : status === "overdue" || (c.due_date >= bounds.start && c.due_date <= bounds.end)))
    .map((c) => ({ ...c, display: chargeDisplayStatus(c.status, c.due_date, today) }))
    .filter((c) => status === "all" || c.display === status);

  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const ranking = [...balances.entries()]
    .filter(([, b]) => b.openCents > 0)
    .sort((a, b) => b[1].overdueCents - a[1].overdueCents || b[1].openCents - a[1].openCents)
    .slice(0, 12);

  const query = (next: { month?: string; status?: string; family?: string }) => {
    const search = new URLSearchParams({ month: next.month ?? month, status: next.status ?? status, family: next.family ?? familyId });
    if (search.get("status") === "all") search.delete("status");
    if (!search.get("family")) search.delete("family");
    return `/finance?${search.toString()}`;
  };
  const exportHref = `/finance/export?${new URLSearchParams({ month, status, ...(selectedFamily ? { family: selectedFamily.id } : {}) }).toString()}`;
  const monthLabel = new Date(`${bounds.start}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="min-w-0">
      <PageHeader
        title="Financeiro"
        description="Cobranças às famílias e repasses à equipe"
        actions={
          <>
            <a href={exportHref} className={buttonClass("outline", "sm")} data-testid="charges-export">
              ↓ Exportar CSV
            </a>
            <NewChargeModal
              families={families.filter((f) => f.status !== "inactive")}
              action={createCharge}
              defaultDueDate={today}
            />
          </>
        }
      />
      <FinanceTabs active="families" />

      {chargesRes.error && <Alert tone="red">Não foi possível carregar as cobranças.</Alert>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          href={query({ status: "overdue", family: "" })}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-t1">
              {selectedFamily ? `Histórico · ${selectedFamily.name}` : "Cobranças às famílias"}
            </h2>
            <form className="flex w-full flex-wrap items-center gap-2 sm:w-auto" action="/finance" data-testid="charges-filter">
              <select
                name="family"
                defaultValue={familyId}
                aria-label="Família"
                className="min-w-0 flex-1 rounded-lg border-[1.5px] border-line bg-white px-2 py-1 text-sm sm:max-w-56 sm:flex-none"
              >
                <option value="">Todas as famílias</option>
                {families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.name}
                  </option>
                ))}
              </select>
              {!selectedFamily && (
                <input type="month" name="month" defaultValue={month} className="rounded-lg border-[1.5px] border-line px-2 py-1 text-sm" aria-label="Mês" />
              )}
              {status !== "all" && <input type="hidden" name="status" value={status} />}
              <button className={buttonClass("ghost", "sm")}>Filtrar</button>
            </form>
          </div>

          {selectedFamily && (
            <div className="grid grid-cols-1 gap-3 border-b border-line px-4 py-4 sm:grid-cols-3 sm:px-5" data-testid="family-balance">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-t3">Total pago</div>
                <div className="text-lg font-extrabold text-ok">{formatCents(familyBalance?.paidCents ?? 0)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-t3">Em aberto</div>
                <div className="text-lg font-extrabold text-t1">{formatCents(familyBalance?.openCents ?? 0)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-t3">Em atraso</div>
                <div className="text-lg font-extrabold text-danger">{formatCents(familyBalance?.overdueCents ?? 0)}</div>
              </div>
              <div className="sm:col-span-3">
                <Link href={query({ family: "" })} className="text-xs font-semibold text-primary hover:underline">
                  ← Voltar para todas as famílias
                </Link>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
            {STATUS_FILTERS.map((filter) => (
              <Link key={filter.key} href={query({ status: filter.key })} className={buttonClass(filter.key === status ? "primary" : "ghost", "sm")}>
                {filter.label}
              </Link>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title="Nenhuma cobrança"
              description={selectedFamily ? "Esta família não tem cobranças com esse filtro." : "Não há cobranças com esse filtro no mês selecionado."}
            />
          ) : (
            <RTable>
              <thead>
                <tr>
                  <RTh>Família</RTh>
                  <RTh>Referência</RTh>
                  <RTh>Valor</RTh>
                  <RTh>Vencimento</RTh>
                  <RTh>Forma</RTh>
                  <RTh>Status</RTh>
                  <RTh>Comprovante</RTh>
                  <RTh>Alterar status</RTh>
                </tr>
              </thead>
              <tbody>
                {visible.map((charge) => {
                  const meta = CHARGE_STATUS_META[charge.display];
                  return (
                    <tr key={charge.id} data-testid="charge-row">
                      <RTd className="font-semibold text-t1">
                        <Link href={query({ family: charge.family_id })} className="hover:text-primary" data-testid="charge-family-link">
                          {charge.family?.name ?? "—"}
                        </Link>
                      </RTd>
                      <RTd label="Referência">{charge.reference}</RTd>
                      <RTd label="Valor" className="font-bold text-t1">
                        {formatCents(charge.amount_cents)}
                      </RTd>
                      <RTd label="Vencimento">{formatDate(charge.due_date)}</RTd>
                      <RTd label="Forma">{charge.payment_method}</RTd>
                      <RTd label="Status">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {charge.paid_at && <div className="mt-1 text-[11px] text-t3">em {formatDate(charge.paid_at)}</div>}
                      </RTd>
                      <RTd label="Comprovante">
                        <div className="flex flex-col items-end gap-1 md:items-start">
                          {charge.receipt_path && (
                            <>
                              <FileLink path={charge.receipt_path} label="Ver comprovante" />
                              {charge.receipt_uploaded_at && <span className="text-[11px] text-t3">{formatDateTime(charge.receipt_uploaded_at)}</span>}
                            </>
                          )}
                          <ReceiptModal
                            action={attachChargeReceipt}
                            fields={{ id: charge.id }}
                            trigger={charge.receipt_path ? "Substituir" : "Anexar"}
                            title={`Comprovante · ${charge.reference}`}
                            submitLabel="Anexar comprovante"
                            testId="charge-receipt"
                          />
                        </div>
                      </RTd>
                      <RTd label="Alterar status">
                        <ChargeStatusForm action={setChargeStatus} chargeId={charge.id} status={charge.status} />
                      </RTd>
                    </tr>
                  );
                })}
              </tbody>
            </RTable>
          )}
        </Card>

        <Card className="h-fit min-w-0">
          <CardTitle>Saldo em aberto por família</CardTitle>
          {ranking.length === 0 ? (
            <p className="text-sm text-t2">Nenhuma família com valores em aberto.</p>
          ) : (
            <ul data-testid="family-ranking">
              {ranking.map(([id, balance]) => (
                <li key={id} className="border-b border-line-light py-2.5 text-sm last:border-0">
                  <Link href={query({ family: id })} className="flex items-center justify-between gap-3 hover:text-primary">
                    <span className="min-w-0 truncate font-semibold text-t1">{familyName.get(id) ?? "Família"}</span>
                    <span className="shrink-0 font-bold text-t1">{formatCents(balance.openCents)}</span>
                  </Link>
                  {balance.overdueCents > 0 && <div className="text-[11px] font-semibold text-danger">{formatCents(balance.overdueCents)} em atraso</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
