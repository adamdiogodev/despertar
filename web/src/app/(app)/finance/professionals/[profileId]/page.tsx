import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MANAGER_ROLES, ROLE_LABELS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { FileLink, InvoiceRequestActions } from "@/components/finance/invoice-request-actions";
import { ManualInvoiceModal } from "@/components/finance/manual-invoice-modal";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { INVOICE_STATUS_META, paymentRange, payoutTotals, requestTitle } from "@/components/finance/logic";
import { createManualRequest } from "../../invoices/actions";

export default async function ProfessionalPayoutsPage({ params, searchParams }: PageProps<"/finance/professionals/[profileId]">) {
  const user = await requireRole(MANAGER_ROLES);
  const { profileId } = await params;
  if (!z.string().guid().safeParse(profileId).success) notFound();
  const query = await searchParams;
  const today = localDateKey(new Date());
  const year = typeof query.year === "string" && /^\d{4}$/.test(query.year) ? query.year : today.slice(0, 4);

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id, full_name, role, active, email").eq("id", profileId).maybeSingle();
  if (!profile || profile.role === "guardian") notFound();

  const { data, error } = await supabase
    .from("invoice_requests")
    .select(
      `id, therapist_id, amount_cents, status, description, sessions_count, invoice_number, invoice_file_path, payment_receipt_path,
       submitted_at, paid_at, created_at, rejection_reason,
       period:payout_periods(id, label), therapy:therapies(name)`,
    )
    .eq("therapist_id", profileId)
    .order("created_at", { ascending: false });
  const requests = data ?? [];
  const withPaidOn = requests.map((r) => ({ ...r, paid_on: r.paid_at ? localDateKey(r.paid_at) : null }));
  const total = payoutTotals(withPaidOn, paymentRange(year, null)!, year).get(profileId);
  const allTime = withPaidOn.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_cents, 0);
  const years = [...new Set([today.slice(0, 4), ...withPaidOn.map((r) => (r.paid_on ?? r.created_at).slice(0, 4))])].sort().reverse();

  return (
    <div className="min-w-0">
      <PageHeader
        title={profile.full_name}
        description={`${ROLE_LABELS[profile.role]} · ${profile.email}${profile.active ? "" : " · inativo"}`}
        actions={
          profile.active && profile.id !== user.id ? (
            <ManualInvoiceModal
              action={createManualRequest}
              payees={[{ id: profile.id, name: profile.full_name, roleLabel: ROLE_LABELS[profile.role] }]}
              defaultPayee={profile.id}
            />
          ) : undefined
        }
      />
      <FinanceTabs active="professionals" />
      <Link href={`/finance/professionals?year=${year}`} className="mb-4 inline-block text-xs font-semibold text-primary hover:underline">
        ← Todos os profissionais
      </Link>
      {error && <Alert tone="red">Não foi possível carregar o histórico.</Alert>}

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Ano">
        {years.map((y) => (
          <Link
            key={y}
            href={`/finance/professionals/${profile.id}?year=${y}`}
            className={
              y === year
                ? "rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary"
                : "rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-t2"
            }
          >
            {y}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`Pago em ${year}`} value={formatCents(total?.paidInYearCents ?? 0)} tone="green" />
        <StatCard label="Em aberto" value={formatCents(total?.openCents ?? 0)} tone="yellow" hint="Aguardando NF, conferência ou pagamento" />
        <StatCard label="Total pago (histórico)" value={formatCents(allTime)} tone="blue" />
      </div>

      <Card className="min-w-0 p-0">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-t1">Notas fiscais e pagamentos</h2>
        </div>
        {requests.length === 0 ? (
          <EmptyState title="Nenhuma solicitação" description="Este profissional ainda não teve notas solicitadas." />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Solicitação</RTh>
                <RTh>Valor</RTh>
                <RTh>Status</RTh>
                <RTh>Nota fiscal</RTh>
                <RTh>Pagamento</RTh>
                <RTh>Ações</RTh>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const meta = INVOICE_STATUS_META[request.status];
                return (
                  <tr key={request.id} data-testid="professional-request-row">
                    <RTd className="text-t1">
                      <div className="font-semibold">
                        {request.period ? (
                          <Link href={`/finance/invoices/${request.period.id}`} className="hover:text-primary">
                            {requestTitle(request)}
                          </Link>
                        ) : (
                          requestTitle(request)
                        )}
                      </div>
                      <div className="text-[11px] text-t3">
                        {request.period ? `${request.sessions_count} sessões` : "Avulsa"} · criada em {formatDate(request.created_at)}
                      </div>
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
                    <RTd label="Nota fiscal">
                      {request.invoice_number ? (
                        <div>
                          <div className="font-semibold text-t1">Nº {request.invoice_number}</div>
                          <FileLink path={request.invoice_file_path} label="Ver arquivo" />
                          {request.submitted_at && <div className="text-[11px] text-t3">{formatDateTime(request.submitted_at)}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-t3">—</span>
                      )}
                    </RTd>
                    <RTd label="Pagamento">
                      {request.paid_at ? (
                        <div>
                          <div className="text-xs font-semibold text-ok">Pago em {formatDate(request.paid_at)}</div>
                          {request.payment_receipt_path ? (
                            <FileLink path={request.payment_receipt_path} label="Ver comprovante" />
                          ) : (
                            <span className="text-[11px] text-t3">sem comprovante</span>
                          )}
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
    </div>
  );
}
