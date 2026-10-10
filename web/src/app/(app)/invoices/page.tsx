import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { SubmitInvoiceModal } from "@/components/finance/submit-invoice-modal";
import { INVOICE_STATUS_META, PAY_MODEL_LABELS, describeRule, rateOn } from "@/components/finance/logic";
import { submitInvoice } from "./actions";

export default async function MyInvoicesPage() {
  const user = await requireRole(["therapist"]);
  const supabase = await createClient();
  const [requestsRes, ratesRes] = await Promise.all([
    supabase
      .from("invoice_requests")
      .select(
        `id, sessions_count, total_minutes, amount_cents, status, invoice_number, invoice_file_path,
         submitted_at, rejection_reason, paid_at, created_at,
         period:payout_periods(label, starts_on, ends_on),
         therapy:therapies(name),
         items:invoice_request_items(appointment_id, pay_model, rate_cents, minutes, amount_cents,
           appointment:appointments(starts_at, patient:patients(full_name)))`,
      )
      .eq("therapist_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("therapist_rates").select("therapist_id, therapy_id, pay_model, amount_cents, valid_from, therapy:therapies(name)").eq("therapist_id", user.id),
  ]);

  const today = localDateKey(new Date());
  const rates = ratesRes.data ?? [];
  const currentRates = [...new Set(rates.map((r) => r.therapy_id))]
    .map((therapyId) => rateOn(rates, user.id, therapyId, today))
    .filter((r) => r != null);
  const requests = requestsRes.data ?? [];
  const pending = requests.filter((r) => r.status === "requested" || r.status === "rejected");

  return (
    <div>
      <PageHeader title="Minhas notas fiscais" description="Solicitações de NF, conferência e repasses" />
      {requestsRes.error && <Alert tone="red">Não foi possível carregar suas solicitações.</Alert>}
      {pending.length > 0 && (
        <Alert tone="yellow">
          Você tem {pending.length} {pending.length === 1 ? "nota fiscal pendente" : "notas fiscais pendentes"} de envio.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {requests.length === 0 && (
            <Card>
              <EmptyState title="Nenhuma solicitação ainda" description="Quando a administração fechar um período, você será avisado aqui." />
            </Card>
          )}
          {requests.map((request) => {
            const meta = INVOICE_STATUS_META[request.status];
            const canSubmit = request.status === "requested" || request.status === "rejected";
            const items = [...request.items].sort((a, b) => (a.appointment?.starts_at ?? "").localeCompare(b.appointment?.starts_at ?? ""));
            return (
              <Card key={request.id} data-testid="my-invoice">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-t1">
                      {request.therapy?.name ?? "Terapia"} · {request.period?.label ?? "Período"}
                    </div>
                    {request.period && (
                      <div className="text-xs text-t3">
                        {formatDate(request.period.starts_on)} a {formatDate(request.period.ends_on)}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-t2">
                      {request.sessions_count} sessões · {request.total_minutes} minutos
                    </div>
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
                            <a
                              href={`/files?path=${encodeURIComponent(request.invoice_file_path)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-primary hover:underline"
                            >
                              ver arquivo
                            </a>
                          </>
                        )}
                        {request.submitted_at && <> · enviada em {formatDateTime(request.submitted_at)}</>}
                      </>
                    )}
                    {request.paid_at && <div className="mt-1 font-semibold text-ok">Repasse realizado em {formatDate(request.paid_at)}</div>}
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

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Detalhamento por sessão ({items.length})</summary>
                  <div className="overflow-x-auto">
                    <table className="mt-2 w-full text-left text-xs">
                      <thead className="text-t3">
                        <tr>
                          <th className="py-1 pr-4 font-semibold">Data</th>
                          <th className="py-1 pr-4 font-semibold">Paciente</th>
                          <th className="py-1 pr-4 font-semibold">Duração</th>
                          <th className="py-1 pr-4 font-semibold">Regra aplicada</th>
                          <th className="py-1 font-semibold">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="text-t2">
                        {items.map((item) => (
                          <tr key={item.appointment_id} className="border-t border-line-light">
                            <td className="py-1 pr-4">{item.appointment ? formatDateTime(item.appointment.starts_at) : "—"}</td>
                            <td className="py-1 pr-4">{item.appointment?.patient?.full_name ?? "—"}</td>
                            <td className="py-1 pr-4">{item.minutes} min</td>
                            <td className="py-1 pr-4">
                              {describeRule(item.pay_model, item.rate_cents)}
                              {item.pay_model === "per_hour" && ` × ${item.minutes} min`}
                            </td>
                            <td className="py-1 font-semibold text-t1">{formatCents(item.amount_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
            );
          })}
        </div>

        <Card className="h-fit">
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
      </div>
    </div>
  );
}
