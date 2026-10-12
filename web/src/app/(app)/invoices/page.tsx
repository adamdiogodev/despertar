import { requireRole, type AppRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SubmitInvoiceModal } from "@/components/finance/submit-invoice-modal";
import { FileLink } from "@/components/finance/invoice-request-actions";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { INVOICE_STATUS_META, PAY_MODEL_LABELS, describeRule, rateOn, requestTitle } from "@/components/finance/logic";
import { submitInvoice } from "./actions";

const PAYEE_ROLES: AppRole[] = ["coordination", "reception", "therapist"];

export default async function MyInvoicesPage() {
  const user = await requireRole(PAYEE_ROLES);
  const isTherapist = user.role === "therapist";
  const supabase = await createClient();
  const [requestsRes, ratesRes] = await Promise.all([
    supabase
      .from("invoice_requests")
      .select(
        `id, sessions_count, total_minutes, amount_cents, status, description, invoice_number, invoice_file_path,
         payment_receipt_path, submitted_at, rejection_reason, paid_at, created_at,
         period:payout_periods(label, starts_on, ends_on),
         therapy:therapies(name),
         items:invoice_request_items(appointment_id, pay_model, rate_cents, minutes, amount_cents,
           appointment:appointments(starts_at, patient:patients(full_name)))`,
      )
      .eq("therapist_id", user.id)
      .order("created_at", { ascending: false }),
    isTherapist
      ? supabase.from("therapist_rates").select("therapist_id, therapy_id, pay_model, amount_cents, valid_from, therapy:therapies(name)").eq("therapist_id", user.id)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const today = localDateKey(new Date());
  const year = today.slice(0, 4);
  const rates = ratesRes.data ?? [];
  const currentRates = [...new Set(rates.map((r) => r.therapy_id))]
    .map((therapyId) => rateOn(rates, user.id, therapyId, today))
    .filter((r) => r != null);
  const requests = requestsRes.data ?? [];
  const open = requests.filter((r) => r.status !== "paid");
  const paid = requests.filter((r) => r.status === "paid").sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));
  const pendingSubmission = open.filter((r) => r.status === "requested" || r.status === "rejected");
  const paidThisYear = paid.filter((r) => r.paid_at && localDateKey(r.paid_at).startsWith(`${year}-`)).reduce((s, r) => s + r.amount_cents, 0);

  return (
    <div className="min-w-0">
      <PageHeader title="Minhas Notas Fiscais" description="Solicitações de NF, conferência e histórico de pagamentos" />
      {requestsRes.error && <Alert tone="red">Não foi possível carregar suas solicitações.</Alert>}
      {pendingSubmission.length > 0 && (
        <Alert tone="yellow">
          Você tem {pendingSubmission.length} {pendingSubmission.length === 1 ? "nota fiscal pendente" : "notas fiscais pendentes"} de envio.
        </Alert>
      )}

      <div className={isTherapist ? "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]" : "grid grid-cols-1 gap-6"}>
        <div className="min-w-0 space-y-4">
          <h2 className="text-sm font-bold text-t1">Em andamento</h2>
          {open.length === 0 && (
            <Card>
              <EmptyState title="Nenhuma nota pendente" description="Quando a administração solicitar uma nota fiscal, você será avisado aqui." />
            </Card>
          )}
          {open.map((request) => {
            const meta = INVOICE_STATUS_META[request.status];
            const canSubmit = request.status === "requested" || request.status === "rejected";
            const items = [...request.items].sort((a, b) => (a.appointment?.starts_at ?? "").localeCompare(b.appointment?.starts_at ?? ""));
            return (
              <Card key={request.id} data-testid="my-invoice">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-t1">
                      {requestTitle(request)}
                      {!request.period && (
                        <Badge tone="gray" className="ml-2">
                          Avulsa
                        </Badge>
                      )}
                    </div>
                    {request.period ? (
                      <>
                        <div className="text-xs text-t3">
                          {formatDate(request.period.starts_on)} a {formatDate(request.period.ends_on)}
                        </div>
                        <div className="mt-2 text-xs text-t2">
                          {request.sessions_count} sessões · {request.total_minutes} minutos
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-t3">Solicitada em {formatDate(request.created_at)}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-extrabold text-t1">{formatCents(request.amount_cents)}</div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                </div>

                {request.status === "rejected" && request.rejection_reason && (
                  <div className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                    <strong>Motivo da recusa:</strong> {request.rejection_reason}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-t2">
                    {request.invoice_number && (
                      <>
                        NF nº <strong className="text-t1">{request.invoice_number}</strong>
                        {request.invoice_file_path && (
                          <>
                            {" · "}
                            <FileLink path={request.invoice_file_path} label="ver arquivo" />
                          </>
                        )}
                        {request.submitted_at && <> · enviada em {formatDateTime(request.submitted_at)}</>}
                      </>
                    )}
                  </div>
                  {canSubmit && (
                    <SubmitInvoiceModal
                      action={submitInvoice}
                      requestId={request.id}
                      amountLabel={formatCents(request.amount_cents)}
                      resubmit={request.status === "rejected"}
                    />
                  )}
                </div>

                {items.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">Detalhamento por sessão ({items.length})</summary>
                    <ul className="mt-2 space-y-1 text-xs text-t2">
                      {items.map((item) => (
                        <li key={item.appointment_id} className="border-t border-line-light pt-1">
                          {item.appointment ? formatDateTime(item.appointment.starts_at) : "—"} · {item.appointment?.patient?.full_name ?? "—"} ·{" "}
                          {item.minutes} min · {describeRule(item.pay_model, item.rate_cents)}
                          {item.pay_model === "per_hour" && ` × ${item.minutes} min`} ·{" "}
                          <strong className="text-t1">{formatCents(item.amount_cents)}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            );
          })}

          <Card className="min-w-0 p-0" data-testid="my-payments">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-4 sm:px-5">
              <h2 className="text-sm font-bold text-t1">Meu histórico de pagamentos</h2>
              <span className="text-sm text-t2">
                Recebido em {year}: <strong className="text-t1">{formatCents(paidThisYear)}</strong>
              </span>
            </div>
            {paid.length === 0 ? (
              <EmptyState icon="💸" title="Nenhum pagamento ainda" />
            ) : (
              <RTable>
                <thead>
                  <tr>
                    <RTh>Referência</RTh>
                    <RTh>Valor</RTh>
                    <RTh>NF</RTh>
                    <RTh>Pago em</RTh>
                    <RTh>Comprovante</RTh>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((request) => (
                    <tr key={request.id} data-testid="my-payment-row">
                      <RTd className="font-semibold text-t1">{requestTitle(request)}</RTd>
                      <RTd label="Valor" className="font-bold text-t1">
                        {formatCents(request.amount_cents)}
                      </RTd>
                      <RTd label="NF">
                        {request.invoice_number ? `Nº ${request.invoice_number}` : "—"}
                        {request.invoice_file_path && (
                          <div>
                            <FileLink path={request.invoice_file_path} label="ver arquivo" />
                          </div>
                        )}
                      </RTd>
                      <RTd label="Pago em">{formatDate(request.paid_at)}</RTd>
                      <RTd label="Comprovante">
                        {request.payment_receipt_path ? (
                          <FileLink path={request.payment_receipt_path} label="Ver comprovante" />
                        ) : (
                          <span className="text-xs text-t3">ainda não anexado</span>
                        )}
                      </RTd>
                    </tr>
                  ))}
                </tbody>
              </RTable>
            )}
          </Card>
        </div>

        {isTherapist && (
          <Card className="h-fit min-w-0">
            <CardTitle>Meus valores de repasse</CardTitle>
            {currentRates.length === 0 ? (
              <p className="text-sm text-t2">Nenhum valor cadastrado. Fale com a administração.</p>
            ) : (
              <ul className="space-y-3" data-testid="my-rates">
                {currentRates.map((rate) => (
                  <li key={rate.therapy_id} className="border-b border-line-light pb-2 text-sm last:border-0">
                    <div className="font-semibold text-t1">{rate.therapy?.name ?? "Terapia"}</div>
                    <div className="text-t2">
                      {PAY_MODEL_LABELS[rate.pay_model]}: {describeRule(rate.pay_model, rate.amount_cents)}
                    </div>
                    <div className="text-[11px] text-t3">vigente desde {formatDate(rate.valid_from)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
