import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, localDateKey } from "@/lib/format";
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui/primitives";
import { ChildSwitcher, ClinicContact } from "@/components/portal/child-switcher";
import { loadClinicSettings, loadPortalChildren } from "@/components/portal/data";
import { chargeDisplayStatus, financeSituation } from "@/components/portal/rules";

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
    .select("id, family_id, reference, amount_cents, due_date, payment_method, status, paid_at, families(name)")
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
    <div>
      <PageHeader title="Financeiro" description="Acompanhe as cobranças da família." />
      <ChildSwitcher items={children} selectedId={selectedId} basePath="/portal/finance" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Situação" value={situation.label} tone={situation.tone} icon="💰" hint={overdueCount > 0 ? `${overdueCount} cobrança(s) em atraso` : undefined} />
        <StatCard label="Total em aberto" value={formatCents(totalOpen)} tone={totalOpen > 0 ? "yellow" : "green"} icon="🧾" />
        <StatCard label="Próximo vencimento" value={nextDue ? formatDate(nextDue) : "—"} tone="blue" icon="📅" />
      </div>

      <Card className="mb-6 p-0">
        <div className="px-5 pt-5">
          <CardTitle>Cobranças</CardTitle>
        </div>
        {charges.length === 0 ? (
          <EmptyState icon="🧾" title="Nenhuma cobrança registrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Referência</Th>
                {manyFamilies && <Th>Família</Th>}
                <Th>Valor</Th>
                <Th>Vencimento</Th>
                <Th>Forma</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => {
                const display = DISPLAY[chargeDisplayStatus(c.status, c.due_date, today)];
                return (
                  <tr key={c.id} data-testid="charge-row">
                    <Td className="font-semibold text-t1">{c.reference}</Td>
                    {manyFamilies && <Td>{c.families?.name}</Td>}
                    <Td className="font-semibold text-t1">{formatCents(c.amount_cents)}</Td>
                    <Td>{formatDate(c.due_date)}</Td>
                    <Td>{c.payment_method}</Td>
                    <Td>
                      <Badge tone={display.tone}>{display.label}</Badge>
                      {c.status === "paid" && c.paid_at && <div className="mt-0.5 text-[11px] text-t3">em {formatDate(c.paid_at)}</div>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
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
