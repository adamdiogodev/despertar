import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatDateTime, localDateKey } from "@/lib/format";
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { FileLink } from "@/components/finance/invoice-request-actions";
import { ReceiptModal } from "@/components/finance/receipt-modal";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { ChildSwitcher, ClinicContact } from "@/components/portal/child-switcher";
import { loadClinicSettings, loadPortalChildren } from "@/components/portal/data";
import { chargeDisplayStatus, financeSituation } from "@/components/portal/rules";
import { sendChargeReceipt } from "./actions";

const DISPLAY = {
  paid: { label: "Pago", tone: "green" },
  pending: { label: "Pendente", tone: "yellow" },
  overdue: { label: "Atrasado", tone: "red" },
  awaiting_insurance: { label: "Aguardando convênio", tone: "blue" },
  canceled: { label: "Cancelada", tone: "gray" },
} as const;

const SITUATION = {
  up_to_date: { label: "Em dia ✓", tone: "green" },
  pending: { label: "Pendente", tone: "yellow" },
  overdue: { label: "Atrasado", tone: "red" },
} as const;

export default async function PortalFinancePage({ searchParams }: PageProps<"/portal/finance">) {
  await requireRole(["guardian"]);
  const { child } = await searchParams;
  const [{ children, selectedId, familyIds }, clinic] = await Promise.all([loadPortalChildren(child), loadClinicSettings()]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("charges")
    .select("id, family_id, reference, amount_cents, due_date, payment_method, status, paid_at, receipt_path, receipt_uploaded_at, families(name)")
    .in("family_id", familyIds)
    .order("due_date", { ascending: false })
    .limit(100);

  const charges = data ?? [];
  const today = localDateKey(new Date());
  const open = charges.filter((c) => c.status === "pending");
  const totalOpen = open.reduce((sum, c) => sum + c.amount_cents, 0);
  const overdueCount = open.filter((c) => c.due_date < today).length;
  const situation = SITUATION[financeSituation(charges, today)];
  const nextDue = open
    .map((c) => c.due_date)
    .filter((d) => d >= today)
    .sort()[0];
  const manyFamilies = new Set(charges.map((c) => c.family_id)).size > 1;

  return (
    <div className="min-w-0">
      <PageHeader title="Financeiro" description="Acompanhe as cobranças da família." />
      <ChildSwitcher items={children} selectedId={selectedId} basePath="/portal/finance" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Situação" value={situation.label} tone={situation.tone} icon="💰" hint={overdueCount > 0 ? `${overdueCount} cobrança(s) em atraso` : undefined} />
        <StatCard label="Total em aberto" value={formatCents(totalOpen)} tone={totalOpen > 0 ? "yellow" : "green"} icon="🧾" />
        <StatCard label="Próximo vencimento" value={nextDue ? formatDate(nextDue) : "—"} tone="blue" icon="📅" />
      </div>

      <Card className="mb-6 min-w-0 p-0">
        <div className="px-5 pt-5">
          <CardTitle>Cobranças</CardTitle>
        </div>
        {charges.length === 0 ? (
          <EmptyState icon="🧾" title="Nenhuma cobrança registrada" />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Referência</RTh>
                {manyFamilies && <RTh>Família</RTh>}
                <RTh>Valor</RTh>
                <RTh>Vencimento</RTh>
                <RTh>Forma</RTh>
                <RTh>Situação</RTh>
                <RTh>Comprovante</RTh>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => {
                const display = DISPLAY[chargeDisplayStatus(c.status, c.due_date, today)];
                const canSend = c.status !== "canceled";
                return (
                  <tr key={c.id} data-testid="charge-row">
                    <RTd className="font-semibold text-t1">{c.reference}</RTd>
                    {manyFamilies && <RTd label="Família">{c.families?.name}</RTd>}
                    <RTd label="Valor" className="font-semibold text-t1">
                      {formatCents(c.amount_cents)}
                    </RTd>
                    <RTd label="Vencimento">{formatDate(c.due_date)}</RTd>
                    <RTd label="Forma">{c.payment_method}</RTd>
                    <RTd label="Situação">
                      <Badge tone={display.tone}>{display.label}</Badge>
                      {c.status === "paid" && c.paid_at && <div className="mt-0.5 text-[11px] text-t3">em {formatDate(c.paid_at)}</div>}
                    </RTd>
                    <RTd label="Comprovante">
                      <div className="flex flex-col items-end gap-1 md:items-start">
                        {c.receipt_path && (
                          <>
                            <FileLink path={c.receipt_path} label="Ver comprovante" />
                            {c.receipt_uploaded_at && <span className="text-[11px] text-t3">enviado em {formatDateTime(c.receipt_uploaded_at)}</span>}
                          </>
                        )}
                        {canSend && (
                          <ReceiptModal
                            action={sendChargeReceipt}
                            fields={{ id: c.id }}
                            trigger={c.receipt_path ? "Enviar outro" : "Enviar comprovante"}
                            triggerVariant={c.receipt_path ? "ghost" : "outline"}
                            title={`Comprovante · ${c.reference}`}
                            submitLabel="Enviar comprovante"
                            description="Envie o comprovante do Pix, boleto ou transferência. A clínica confere e atualiza a situação da cobrança."
                            testId="portal-charge-receipt"
                          />
                        )}
                        {!canSend && !c.receipt_path && <span className="text-xs text-t3">—</span>}
                      </div>
                    </RTd>
                  </tr>
                );
              })}
            </tbody>
          </RTable>
        )}
      </Card>

      <Card>
        <CardTitle>Como pagar</CardTitle>
        <p className="text-sm text-t2">
          O pagamento é feito diretamente com a clínica, pela forma indicada em cada cobrança (Pix, boleto ou convênio). Ficou com alguma dúvida
          ou precisa da chave Pix / segunda via do boleto? Fale com a gente:
        </p>
        <div className="mt-3 text-sm">
          <ClinicContact phone={clinic.phone} whatsapp={clinic.whatsapp} email={clinic.email} />
        </div>
      </Card>
    </div>
  );
}
