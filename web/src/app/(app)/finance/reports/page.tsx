import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { formatCents, formatDate } from "@/lib/format";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui/primitives";
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
    <div>
      <PageHeader
        title="Relatório de terapias"
        description={`Sessões por terapeuta e terapia · ${formatDate(from)} a ${formatDate(to)}`}
        actions={
          <>
            <LinkButton href="/finance" variant="ghost" size="sm">
              ← Financeiro
            </LinkButton>
            <a href={exportHref} className={buttonClass("outline", "sm")} data-testid="report-export">
              ↓ Exportar CSV
            </a>
          </>
        }
      />

      <Card className="p-0">
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4" action="/finance/reports">
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
          <Table>
            <thead>
              <tr>
                <Th>Terapeuta</Th>
                <Th>Terapia</Th>
                <Th>Concluídas</Th>
                <Th>Faltas</Th>
                <Th>Canceladas</Th>
                <Th>Minutos realizados</Th>
                <Th>Valor estimado a repassar</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.therapistId}-${row.therapyId}`} data-testid="report-row">
                  <Td className="font-semibold text-t1">{row.therapistName}</Td>
                  <Td>{row.therapyName}</Td>
                  <Td>{row.completed}</Td>
                  <Td>{row.noShow}</Td>
                  <Td>{row.canceled}</Td>
                  <Td>{row.completedMinutes}</Td>
                  <Td className="font-bold text-t1">
                    {formatCents(row.estimatedCents)}
                    {row.missingRate && (
                      <Link href={`/therapists/${row.therapistId}`} className="ml-2 text-xs font-semibold text-danger underline">
                        sem valor cadastrado
                      </Link>
                    )}
                  </Td>
                </tr>
              ))}
              <tr className="bg-line-light">
                <Td className="font-bold text-t1">Total</Td>
                <Td />
                <Td className="font-bold">{totals.completed}</Td>
                <Td className="font-bold">{totals.noShow}</Td>
                <Td className="font-bold">{totals.canceled}</Td>
                <Td className="font-bold">{totals.minutes}</Td>
                <Td className="font-bold text-t1">{formatCents(totals.cents)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-t3">
        Valor estimado com a regra vigente na data de cada sessão concluída (por sessão: valor fixo; por hora: proporcional à duração real).
      </p>
    </div>
  );
}
