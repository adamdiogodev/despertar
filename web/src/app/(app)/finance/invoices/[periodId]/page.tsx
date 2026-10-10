import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/finance/action-button";
import { GenerateRequestsForm, RejectInvoiceModal } from "@/components/finance/invoice-admin-forms";
import { INVOICE_STATUS_META, describeRule, groupPreview } from "@/components/finance/logic";
import { approveInvoice, closePeriod, generateRequests, payInvoice, rejectInvoice } from "../actions";

export default async function InvoicePeriodPage({ params }: PageProps<"/finance/invoices/[periodId]">) {
  const user = await requireRole(MANAGER_ROLES);
  const isAdmin = user.role === "admin";
  const { periodId } = await params;
  if (!z.string().guid().safeParse(periodId).success) notFound();

  const supabase = await createClient();
  const { data: period } = await supabase.from("payout_periods").select("id, label, starts_on, ends_on, status").eq("id", periodId).maybeSingle();
  if (!period) notFound();
  const isOpen = period.status === "open";

  const [previewRes, requestsRes, therapistsRes, therapiesRes] = await Promise.all([
    isOpen ? supabase.rpc("preview_invoice_items", { target_period: periodId }) : Promise.resolve({ data: [], error: null }),
    supabase
      .from("invoice_requests")
      .select(
        `id, therapist_id, sessions_count, total_minutes, amount_cents, status, invoice_number, invoice_file_path,
         submitted_at, rejection_reason, paid_at,
         therapy:therapies(name),
         items:invoice_request_items(appointment_id, pay_model, rate_cents, minutes, amount_cents,
           appointment:appointments(starts_at, patient:patients(full_name)))`,
      )
      .eq("period_id", periodId)
      .order("created_at"),
    supabase.from("therapists").select("id, profile:profiles(full_name)"),
    supabase.from("therapies").select("id, name"),
  ]);

  const therapistName = new Map((therapistsRes.data ?? []).map((t) => [t.id, t.profile?.full_name ?? "Terapeuta"]));
  const therapyName = new Map((therapiesRes.data ?? []).map((t) => [t.id, t.name]));
  const preview = groupPreview(previewRes.data ?? []);
  const requests = (requestsRes.data ?? []).sort((a, b) =>
    (therapistName.get(a.therapist_id) ?? "").localeCompare(therapistName.get(b.therapist_id) ?? ""),
  );
  const requestsTotal = requests.reduce((sum, r) => sum + r.amount_cents, 0);

  return (
    <div>
      <PageHeader
        title={period.label}
        description={`${formatDate(period.starts_on)} a ${formatDate(period.ends_on)} · somente sessões concluídas`}
        actions={
          <>
            <Badge tone={isOpen ? "green" : "gray"}>{isOpen ? "Aberto" : "Fechado"}</Badge>
            <LinkButton href="/finance/invoices" variant="ghost" size="sm">
              ← Períodos
            </LinkButton>
            {isAdmin && isOpen && (
              <ActionButton
                action={closePeriod}
                fields={{ period_id: period.id }}
                label="Fechar período"
                variant="outline"
                confirmMessage="Fechar o período? Não será mais possível gerar solicitações nele."
                testId="close-period"
              />
            )}
          </>
        }
      />
      {!isAdmin && <Alert tone="blue">Visualização somente leitura.</Alert>}

      {isOpen && (
        <Card className="mb-6">
          <CardTitle>Prévia — sessões concluídas ainda não faturadas</CardTitle>
          {previewRes.error && <Alert tone="red">Não foi possível calcular a prévia.</Alert>}
          {preview.length === 0 ? (
            <p className="text-sm text-t2">Nenhuma sessão concluída pendente de faturamento neste período.</p>
          ) : (
            <Table className="mb-4">
              <thead>
                <tr>
                  <Th>Terapeuta</Th>
                  <Th>Terapia</Th>
                  <Th>Sessões</Th>
                  <Th>Minutos</Th>
                  <Th>Regra</Th>
                  <Th>Total</Th>
                </tr>
              </thead>
              <tbody>
                {preview.map((group) => (
                  <tr key={`${group.therapistId}-${group.therapyId}`} data-testid="preview-row">
                    <Td className="font-semibold text-t1">{therapistName.get(group.therapistId) ?? "—"}</Td>
                    <Td>{therapyName.get(group.therapyId) ?? "—"}</Td>
                    <Td>{group.sessions}</Td>
                    <Td>{group.minutes}</Td>
                    <Td>
                      {group.missingRate ? (
                        <span className="font-semibold text-danger">
                          Sem valor cadastrado ·{" "}
                          <Link href={`/therapists/${group.therapistId}`} className="underline">
                            cadastrar
                          </Link>
                        </span>
                      ) : (
                        group.rules.join(" · ")
                      )}
                    </Td>
                    <Td className="font-bold text-t1">{group.missingRate ? "—" : formatCents(group.totalCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {isAdmin && <GenerateRequestsForm action={generateRequests} periodId={period.id} />}
        </Card>
      )}

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold text-t1">Solicitações de nota fiscal</h2>
          <span className="text-sm font-bold text-t1">Total: {formatCents(requestsTotal)}</span>
        </div>
        {requests.length === 0 ? (
          <EmptyState title="Nenhuma solicitação" description="Gere as solicitações para avisar os terapeutas." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Terapeuta</Th>
                <Th>Terapia</Th>
                <Th>Sessões</Th>
                <Th>Minutos</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>NF</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            {requests.map((request) => {
              const meta = INVOICE_STATUS_META[request.status];
              const items = [...request.items].sort((a, b) => (a.appointment?.starts_at ?? "").localeCompare(b.appointment?.starts_at ?? ""));
              return (
                <tbody key={request.id} data-testid="invoice-request-row">
                  <tr>
                    <Td className="font-semibold text-t1">{therapistName.get(request.therapist_id) ?? "—"}</Td>
                    <Td>{request.therapy?.name ?? "—"}</Td>
                    <Td>{request.sessions_count}</Td>
                    <Td>{request.total_minutes}</Td>
                    <Td className="font-bold text-t1">{formatCents(request.amount_cents)}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {request.status === "rejected" && request.rejection_reason && (
                        <div className="mt-1 max-w-48 text-[11px] text-danger">{request.rejection_reason}</div>
                      )}
                      {request.paid_at && <div className="mt-1 text-[11px] text-t3">pago em {formatDate(request.paid_at)}</div>}
                    </Td>
                    <Td>
                      {request.invoice_number ? (
                        <div>
                          <div className="font-semibold text-t1">Nº {request.invoice_number}</div>
                          {request.invoice_file_path && (
                            <a
                              href={`/files?path=${encodeURIComponent(request.invoice_file_path)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              Ver arquivo
                            </a>
                          )}
                          {request.submitted_at && <div className="text-[11px] text-t3">{formatDateTime(request.submitted_at)}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-t3">—</span>
                      )}
                    </Td>
                    <Td>
                      {isAdmin && request.status === "submitted" && (
                        <div className="flex gap-2">
                          <ActionButton
                            action={approveInvoice}
                            fields={{ id: request.id, period_id: period.id }}
                            label="Aprovar"
                            variant="success"
                            testId="approve-invoice"
                          />
                          <RejectInvoiceModal action={rejectInvoice} requestId={request.id} periodId={period.id} />
                        </div>
                      )}
                      {isAdmin && request.status === "approved" && (
                        <ActionButton
                          action={payInvoice}
                          fields={{ id: request.id, period_id: period.id }}
                          label="Marcar paga"
                          variant="primary"
                          confirmMessage={`Confirmar o repasse de ${formatCents(request.amount_cents)}?`}
                          testId="pay-invoice"
                        />
                      )}
                    </Td>
                  </tr>
                  <tr>
                    <td colSpan={8} className="border-b border-line px-4 pb-3">
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-primary">Ver sessões ({items.length})</summary>
                        <table className="mt-2 w-full text-left text-xs">
                          <thead className="text-t3">
                            <tr>
                              <th className="py-1 pr-4 font-semibold">Data</th>
                              <th className="py-1 pr-4 font-semibold">Paciente</th>
                              <th className="py-1 pr-4 font-semibold">Minutos</th>
                              <th className="py-1 pr-4 font-semibold">Regra</th>
                              <th className="py-1 font-semibold">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="text-t2">
                            {items.map((item) => (
                              <tr key={item.appointment_id} className="border-t border-line-light">
                                <td className="py-1 pr-4">{item.appointment ? formatDateTime(item.appointment.starts_at) : "—"}</td>
                                <td className="py-1 pr-4">{item.appointment?.patient?.full_name ?? "—"}</td>
                                <td className="py-1 pr-4">{item.minutes}</td>
                                <td className="py-1 pr-4">
                                  {describeRule(item.pay_model, item.rate_cents)}
                                </td>
                                <td className="py-1 font-semibold text-t1">{formatCents(item.amount_cents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
