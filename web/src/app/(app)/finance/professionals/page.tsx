import Link from "next/link";
import { MANAGER_ROLES, ROLE_LABELS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard, buttonClass } from "@/components/ui/primitives";
import { FinanceTabs, ProfessionalsSubnav } from "@/components/finance/finance-tabs";
import { FileLink, InvoiceRequestActions } from "@/components/finance/invoice-request-actions";
import { ManualInvoiceModal } from "@/components/finance/manual-invoice-modal";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { INVOICE_STATUS_META, paymentRange, payoutTotals, requestTitle, type InvoiceStatus } from "@/components/finance/logic";
import { createManualRequest } from "../invoices/actions";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Pending work first: NFs to check, then approved ones to pay, then those waiting for the NF.
const PENDING_ORDER: InvoiceStatus[] = ["submitted", "approved", "rejected", "requested"];

export default async function ProfessionalsFinancePage({ searchParams }: PageProps<"/finance/professionals">) {
  const user = await requireRole(MANAGER_ROLES);
  const params = await searchParams;
  const today = localDateKey(new Date());
  const year = typeof params.year === "string" && /^\d{4}$/.test(params.year) ? params.year : today.slice(0, 4);
  const month = typeof params.month === "string" && /^(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const range = paymentRange(year, month)!;
  const rangeLabel = month ? `${MONTHS[Number(month) - 1]}/${year}` : year;

  const supabase = await createClient();
  const [profilesRes, requestsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, active").neq("role", "guardian").order("full_name"),
    supabase
      .from("invoice_requests")
      .select(
        `id, therapist_id, amount_cents, status, description, invoice_number, invoice_file_path, payment_receipt_path,
         submitted_at, paid_at, created_at, rejection_reason,
         period:payout_periods(label), therapy:therapies(name)`,
      )
      .order("created_at", { ascending: false }),
  ]);

  const profiles = profilesRes.data ?? [];
  const requests = requestsRes.data ?? [];
  const profileName = new Map(profiles.map((p) => [p.id, p.full_name]));
  const totals = payoutTotals(
    requests.map((r) => ({ ...r, paid_on: r.paid_at ? localDateKey(r.paid_at) : null })),
    range,
    year,
  );
  const pending = requests
    .filter((r) => r.status !== "paid")
    .sort((a, b) => PENDING_ORDER.indexOf(a.status) - PENDING_ORDER.indexOf(b.status));
  const sumBy = (statuses: InvoiceStatus[]) => requests.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.amount_cents, 0);
  const countBy = (statuses: InvoiceStatus[]) => requests.filter((r) => statuses.includes(r.status)).length;
  const paidInRange = [...totals.values()].reduce((s, t) => s + t.paidInRangeCents, 0);
  // Every active team member, plus inactive ones that still have payout history.
  const listed = profiles.filter((p) => p.active || totals.has(p.id));
  const payees = profiles.filter((p) => p.active && p.id !== user.id).map((p) => ({ id: p.id, name: p.full_name, roleLabel: ROLE_LABELS[p.role] }));
  const years = Array.from({ length: 4 }, (_, i) => String(Number(today.slice(0, 4)) - i));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Financeiro"
        description="Cobranças às famílias e repasses à equipe"
        actions={<ManualInvoiceModal action={createManualRequest} payees={payees} />}
      />
      <FinanceTabs active="professionals" />
      <ProfessionalsSubnav active="overview" />
      {requestsRes.error && <Alert tone="red">Não foi possível carregar as solicitações.</Alert>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aguardando NF" value={countBy(["requested", "rejected"])} tone="yellow" hint={formatCents(sumBy(["requested", "rejected"]))} />
        <StatCard label="NF para conferir" value={countBy(["submitted"])} tone="blue" hint={formatCents(sumBy(["submitted"]))} />
        <StatCard label="Aprovadas a pagar" value={formatCents(sumBy(["approved"]))} tone="purple" hint={`${countBy(["approved"])} nota(s)`} />
        <StatCard label={`Pago · ${rangeLabel}`} value={formatCents(paidInRange)} tone="green" />
      </div>

      <Card className="mb-6 min-w-0 p-0">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-t1">Pendências ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState icon="✅" title="Nada pendente" description="Todas as notas solicitadas foram pagas." />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Profissional</RTh>
                <RTh>Solicitação</RTh>
                <RTh>Valor</RTh>
                <RTh>Status</RTh>
                <RTh>NF</RTh>
                <RTh>Ações</RTh>
              </tr>
            </thead>
            <tbody>
              {pending.map((request) => {
                const meta = INVOICE_STATUS_META[request.status];
                return (
                  <tr key={request.id} data-testid="pending-request-row">
                    <RTd className="font-semibold text-t1">
                      <Link href={`/finance/professionals/${request.therapist_id}`} className="hover:text-primary">
                        {profileName.get(request.therapist_id) ?? "Profissional"}
                      </Link>
                    </RTd>
                    <RTd label="Solicitação">
                      {requestTitle(request)}
                      {!request.period && (
                        <Badge tone="gray" className="ml-1">
                          Avulsa
                        </Badge>
                      )}
                    </RTd>
                    <RTd label="Valor" className="font-bold text-t1">
                      {formatCents(request.amount_cents)}
                    </RTd>
                    <RTd label="Status">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {request.status === "rejected" && request.rejection_reason && (
                        <div className="mt-1 max-w-56 text-[11px] text-danger">{request.rejection_reason}</div>
                      )}
                    </RTd>
                    <RTd label="NF">
                      {request.invoice_number ? (
                        <div>
                          <div className="font-semibold text-t1">Nº {request.invoice_number}</div>
                          <FileLink path={request.invoice_file_path} label="Ver arquivo" />
                        </div>
                      ) : (
                        <span className="text-xs text-t3">—</span>
                      )}
                    </RTd>
                    <RTd label="Ações">
                      <InvoiceRequestActions request={request} canManage={request.therapist_id !== user.id} />
                    </RTd>
                  </tr>
                );
              })}
            </tbody>
          </RTable>
        )}
      </Card>

      <Card className="min-w-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-t1">Histórico de pagamentos por profissional</h2>
          <form className="flex flex-wrap items-center gap-2" action="/finance/professionals" data-testid="payouts-filter">
            <select name="year" defaultValue={year} aria-label="Ano" className="rounded-lg border-[1.5px] border-line bg-white px-2 py-1 text-sm">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <select name="month" defaultValue={month ?? ""} aria-label="Mês" className="rounded-lg border-[1.5px] border-line bg-white px-2 py-1 text-sm">
              <option value="">Ano todo</option>
              {MONTHS.map((label, i) => (
                <option key={label} value={String(i + 1).padStart(2, "0")}>
                  {label}
                </option>
              ))}
            </select>
            <button className={buttonClass("ghost", "sm")}>Filtrar</button>
          </form>
        </div>
        {listed.length === 0 ? (
          <EmptyState title="Nenhum profissional" />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Profissional</RTh>
                <RTh>Função</RTh>
                {month && <RTh>Pago em {rangeLabel}</RTh>}
                <RTh>Pago em {year}</RTh>
                <RTh>Em aberto</RTh>
                <RTh>Solicitações</RTh>
              </tr>
            </thead>
            <tbody>
              {listed.map((profile) => {
                const total = totals.get(profile.id);
                return (
                  <tr key={profile.id} data-testid="professional-row">
                    <RTd className="font-semibold text-t1">
                      <Link href={`/finance/professionals/${profile.id}?year=${year}`} className="hover:text-primary">
                        {profile.full_name}
                      </Link>
                      {!profile.active && <span className="ml-1 text-[11px] text-t3">(inativo)</span>}
                    </RTd>
                    <RTd label="Função">{ROLE_LABELS[profile.role]}</RTd>
                    {month && <RTd label={`Pago em ${rangeLabel}`}>{formatCents(total?.paidInRangeCents ?? 0)}</RTd>}
                    <RTd label={`Pago em ${year}`} className="font-bold text-t1">
                      {formatCents(total?.paidInYearCents ?? 0)}
                    </RTd>
                    <RTd label="Em aberto">{formatCents(total?.openCents ?? 0)}</RTd>
                    <RTd label="Solicitações">
                      <Link href={`/finance/professionals/${profile.id}?year=${year}`} className="text-xs font-semibold text-primary hover:underline">
                        {total?.count ?? 0} · ver histórico
                      </Link>
                    </RTd>
                  </tr>
                );
              })}
            </tbody>
          </RTable>
        )}
      </Card>
      <p className="mt-3 text-xs text-t3">Pagamentos contados pela data do repasse ({formatDate(range.start)} a {formatDate(range.end)}).</p>
    </div>
  );
}
