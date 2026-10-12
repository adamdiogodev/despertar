import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { FinanceTabs, ProfessionalsSubnav } from "@/components/finance/finance-tabs";
import { FileLink, InvoiceRequestActions } from "@/components/finance/invoice-request-actions";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { ActionButton } from "@/components/finance/action-button";
import { GenerateRequestsForm } from "@/components/finance/invoice-admin-forms";
import { INVOICE_STATUS_META, describeRule, groupPreview } from "@/components/finance/logic";
import { closePeriod, generateRequests } from "../actions";

export default async function InvoicePeriodPage({ params }: PageProps<"/finance/invoices/[periodId]">) {
  const user = await requireRole(MANAGER_ROLES);
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
        `id, therapist_id, sessions_count, total_minutes, amount_cents, status, invoice_number, invoice_file_path, payment_receipt_path,
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
    <div className="min-w-0">
      <PageHeader
        title={period.label}
        description={`${formatDate(period.starts_on)} a ${formatDate(period.ends_on)} · somente sessões concluídas`}
        actions={
          <>
            <Badge tone={isOpen ? "green" : "gray"}>{isOpen ? "Aberto" : "Fechado"}</Badge>
            <LinkButton href="/finance/invoices" variant="ghost" size="sm">
              ← Períodos
            </LinkButton>
            {isOpen && (
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
      <FinanceTabs active="professionals" />
      <ProfessionalsSubnav active="periods" />

      {isOpen && (
        <Card className="mb-6 min-w-0">
          <CardTitle>Prévia — sessões concluídas ainda não faturadas</CardTitle>
          {previewRes.error && <Alert tone="red">Não foi possível calcular a prévia.</Alert>}
          {preview.length === 0 ? (
            <p className="text-sm text-t2">Nenhuma sessão concluída pendente de faturamento neste período.</p>
          ) : (
            <RTable className="mb-4 p-0!">
              <thead>
                <tr>
                  <RTh>Terapeuta</RTh>
                  <RTh>Terapia</RTh>
                  <RTh>Sessões</RTh>
                  <RTh>Minutos</RTh>
                  <RTh>Regra</RTh>
                  <RTh>Total</RTh>
                </tr>
              </thead>
              <tbody>
                {preview.map((group) => (
                  <tr key={`${group.therapistId}-${group.therapyId}`} data-testid="preview-row">
                    <RTd className="font-semibold text-t1">{therapistName.get(group.therapistId) ?? "—"}</RTd>
                    <RTd label="Terapia">{therapyName.get(group.therapyId) ?? "—"}</RTd>
                    <RTd label="Sessões">{group.sessions}</RTd>
                    <RTd label="Minutos">{group.minutes}</RTd>
                    <RTd label="Regra">
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
                    </RTd>
                    <RTd label="Total" className="font-bold text-t1">
                      {group.missingRate ? "—" : formatCents(group.totalCents)}
                    </RTd>
                  </tr>
                ))}
              </tbody>
            </RTable>
          )}
          <GenerateRequestsForm action={generateRequests} periodId={period.id} />
        </Card>
      )}

      <Card className="min-w-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-t1">Solicitações de nota fiscal</h2>
          <span className="text-sm font-bold text-t1">Total: {formatCents(requestsTotal)}</span>
        </div>
        {requests.length === 0 ? (
          <EmptyState title="Nenhuma solicitação" description="Gere as solicitações para avisar os terapeutas." />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Terapeuta</RTh>
                <RTh>Terapia</RTh>
                <RTh>Sessões</RTh>
                <RTh>Minutos</RTh>
                <RTh>Valor</RTh>
                <RTh>Status</RTh>
                <RTh>NF</RTh>
                <RTh>Ações</RTh>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const meta = INVOICE_STATUS_META[request.status];
                const items = [...request.items].sort((a, b) => (a.appointment?.starts_at ?? "").localeCompare(b.appointment?.starts_at ?? ""));
                return (
                  <tr key={request.id} data-testid="invoice-request-row">
                    <RTd className="font-semibold text-t1">
                      <Link href={`/finance/professionals/${request.therapist_id}`} className="hover:text-primary">
                        {therapistName.get(request.therapist_id) ?? "—"}
                      </Link>
                      <details className="mt-1 font-normal">
                        <summary className="cursor-pointer text-xs font-semibold text-primary">Ver sessões ({items.length})</summary>
                        <ul className="mt-2 space-y-1 text-xs text-t2">
                          {items.map((item) => (
                            <li key={item.appointment_id} className="border-t border-line-light pt-1">
                              {item.appointment ? formatDateTime(item.appointment.starts_at) : "—"} · {item.appointment?.patient?.full_name ?? "—"} ·{" "}
                              {item.minutes} min · {describeRule(item.pay_model, item.rate_cents)} ·{" "}
                              <strong className="text-t1">{formatCents(item.amount_cents)}</strong>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </RTd>
                    <RTd label="Terapia">{request.therapy?.name ?? "—"}</RTd>
                    <RTd label="Sessões">{request.sessions_count}</RTd>
                    <RTd label="Minutos">{request.total_minutes}</RTd>
                    <RTd label="Valor" className="font-bold text-t1">
                      {formatCents(request.amount_cents)}
                    </RTd>
                    <RTd label="Status">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {request.status === "rejected" && request.rejection_reason && (
                        <div className="mt-1 max-w-48 text-[11px] text-danger">{request.rejection_reason}</div>
                      )}
                      {request.paid_at && <div className="mt-1 text-[11px] text-t3">pago em {formatDate(request.paid_at)}</div>}
                      <FileLink path={request.payment_receipt_path} label="Comprovante" />
                    </RTd>
                    <RTd label="NF">
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
