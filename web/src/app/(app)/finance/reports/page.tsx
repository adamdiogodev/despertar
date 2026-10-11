import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { formatCents, formatDate } from "@/lib/format";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui/primitives";
import { FinanceTabs, ProfessionalsSubnav } from "@/components/finance/finance-tabs";
import { RTable, RTd, RTh } from "@/components/finance/responsive-table";
import { loadTherapyReport, reportRange } from "@/components/finance/therapy-report";

export default async function TherapyReportPage({ searchParams }: PageProps<"/finance/reports">) {
  await requireRole(MANAGER_ROLES);
  const params = await searchParams;
  const { from, to } = reportRange(params.from, params.to);
  const rows = await loadTherapyReport(from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      completed: acc.completed + r.completed,
      noShow: acc.noShow + r.noShow,
      canceled: acc.canceled + r.canceled,
      minutes: acc.minutes + r.completedMinutes,
      cents: acc.cents + r.estimatedCents,
    }),
    { completed: 0, noShow: 0, canceled: 0, minutes: 0, cents: 0 },
  );
  const exportHref = `/finance/reports/export?${new URLSearchParams({ from, to }).toString()}`;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Financeiro"
        description={`Relatório de terapias · sessões por terapeuta e terapia · ${formatDate(from)} a ${formatDate(to)}`}
        actions={
          <a href={exportHref} className={buttonClass("outline", "sm")} data-testid="report-export">
            ↓ Exportar CSV
          </a>
        }
      />
      <FinanceTabs active="professionals" />
      <ProfessionalsSubnav active="reports" />

      <Card className="min-w-0 p-0">
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-4 sm:px-5" action="/finance/reports">
          <label className="text-xs font-semibold text-t2">
            De
            <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border-[1.5px] border-line px-2 py-1 text-sm" />
          </label>
          <label className="text-xs font-semibold text-t2">
            Até
            <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border-[1.5px] border-line px-2 py-1 text-sm" />
          </label>
          <button className={buttonClass("ghost", "sm")}>Aplicar</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="Sem sessões no período" description="Nenhuma sessão concluída, falta ou cancelamento entre as datas escolhidas." />
        ) : (
          <RTable>
            <thead>
              <tr>
                <RTh>Terapeuta</RTh>
                <RTh>Terapia</RTh>
                <RTh>Concluídas</RTh>
                <RTh>Faltas</RTh>
                <RTh>Canceladas</RTh>
                <RTh>Minutos realizados</RTh>
                <RTh>Valor estimado a repassar</RTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.therapistId}-${row.therapyId}`} data-testid="report-row">
                  <RTd className="font-semibold text-t1">{row.therapistName}</RTd>
                  <RTd label="Terapia">{row.therapyName}</RTd>
                  <RTd label="Concluídas">{row.completed}</RTd>
                  <RTd label="Faltas">{row.noShow}</RTd>
                  <RTd label="Canceladas">{row.canceled}</RTd>
                  <RTd label="Minutos">{row.completedMinutes}</RTd>
                  <RTd label="A repassar" className="font-bold text-t1">
                    {formatCents(row.estimatedCents)}
                    {row.missingRate && (
                      <Link href={`/therapists/${row.therapistId}`} className="ml-2 text-xs font-semibold text-danger underline">
                        sem valor cadastrado
                      </Link>
                    )}
                  </RTd>
                </tr>
              ))}
              <tr className="bg-line-light">
                <RTd className="font-bold text-t1">Total</RTd>
                <RTd className="max-md:hidden" />
                <RTd label="Concluídas" className="font-bold">{totals.completed}</RTd>
                <RTd label="Faltas" className="font-bold">{totals.noShow}</RTd>
                <RTd label="Canceladas" className="font-bold">{totals.canceled}</RTd>
                <RTd label="Minutos" className="font-bold">{totals.minutes}</RTd>
                <RTd label="A repassar" className="font-bold text-t1">{formatCents(totals.cents)}</RTd>
              </tr>
            </tbody>
          </RTable>
        )}
      </Card>
      <p className="mt-3 text-xs text-t3">
        Valor estimado com a regra vigente na data de cada sessão concluída (por sessão: valor fixo; por hora: proporcional à duração real).
      </p>
    </div>
  );
}
