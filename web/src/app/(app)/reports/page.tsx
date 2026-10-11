import Link from "next/link";
import { requireRole, MANAGER_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCEPT_ATTRIBUTE } from "@/lib/files";
import { formatDate, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, Table, Tabs, Td, Th, buttonClass, cn } from "@/components/ui/primitives";
import { ActionButton } from "@/components/documents/action-button";
import { CreateReportModal, ReturnReportModal, SubmitReportModal, type PatientOption } from "@/components/reports/report-forms";
import {
  REPORT_SELECT,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  deadlineState,
  filterReports,
  parseStatus,
  quarterStart,
  type ReportRow,
  type ReportStatus,
} from "@/components/reports/report-utils";
import { approveReport, createReport, returnReport, submitReport } from "./actions";

const STATUS_TONES: Record<ReportStatus, "yellow" | "blue" | "green" | "red"> = {
  pending: "yellow",
  in_review: "blue",
  approved: "green",
  returned: "red",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const isManager = MANAGER_ROLES.includes(user.role);
  const params = await searchParams;
  const tab = parseStatus(param(params.tab));
  const q = param(params.q) ?? "";
  const therapistFilter = isManager ? (param(params.therapist) ?? "") : "";

  const supabase = await createClient();
  const today = localDateKey(new Date());

  let assignmentsQuery = supabase
    .from("care_assignments")
    .select("patient_id, therapist_id, patient:patients(full_name), therapist:therapists(profile:profiles(full_name))")
    .lte("starts_on", today)
    .or(`ends_on.is.null,ends_on.gte.${today}`);
  if (user.role === "therapist") assignmentsQuery = assignmentsQuery.eq("therapist_id", user.id);

  const [{ data: reportData, error }, { data: assignments }] = await Promise.all([
    supabase.from("reports").select(REPORT_SELECT).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    assignmentsQuery,
  ]);
  if (error) throw new Error(error.message);
  const reports = (reportData ?? []) as unknown as ReportRow[];

  // Patient → therapists with an active link (feeds the request form).
  const patientMap = new Map<string, PatientOption>();
  for (const a of assignments ?? []) {
    if (!a.patient) continue;
    const entry = patientMap.get(a.patient_id) ?? { id: a.patient_id, name: a.patient.full_name, therapists: [] };
    if (!entry.therapists.some((t) => t.id === a.therapist_id)) {
      entry.therapists.push({ id: a.therapist_id, name: a.therapist?.profile?.full_name ?? "—" });
    }
    patientMap.set(a.patient_id, entry);
  }
  const patientOptions = [...patientMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const therapistOptions = new Map<string, string>();
  for (const r of reports) therapistOptions.set(r.therapist_id, r.therapist?.profile?.full_name ?? "—");

  const counts = Object.fromEntries(
    (["pending", "in_review", "approved", "returned"] as ReportStatus[]).map((s) => [s, filterReports(reports, { status: s }).length]),
  ) as Record<ReportStatus, number>;
  const qStart = quarterStart(today);
  const approvedThisQuarter = reports.filter((r) => r.status === "approved" && r.reviewed_at && localDateKey(r.reviewed_at) >= qStart).length;

  const rows = filterReports(reports, { status: tab, q, therapistId: therapistFilter || undefined });
  const query = (overrides: Record<string, string>) => {
    const search = new URLSearchParams({ tab, ...(q && { q }), ...(therapistFilter && { therapist: therapistFilter }), ...overrides });
    return search.toString();
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description={isManager ? "Solicitação, revisão e aprovação de relatórios terapêuticos" : "Seus relatórios terapêuticos"}
        actions={
          <>
            <LinkButton href={`/reports/export?${query({})}`} variant="outline" size="sm" prefetch={false}>
              ↓ Exportar planilha
            </LinkButton>
            {patientOptions.length > 0 && <CreateReportModal action={createReport} patients={patientOptions} chooseTherapist={isManager} />}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pendentes" value={counts.pending} hint="Aguardando envio" tone="yellow" href={`/reports?${query({ tab: "pending" })}`} />
        <StatCard label="Em revisão" value={counts.in_review} hint="Pela coordenação" tone="blue" href={`/reports?${query({ tab: "in_review" })}`} />
        <StatCard label="Aprovados" value={approvedThisQuarter} hint="Este trimestre" tone="green" href={`/reports?${query({ tab: "approved" })}`} />
        <StatCard label="Devolvidos" value={counts.returned} hint="Para correção" tone="red" href={`/reports?${query({ tab: "returned" })}`} />
      </div>

      <Tabs
        active={tab}
        tabs={[
          { key: "pending", label: `⏳ Pendentes (${counts.pending})`, href: `/reports?${query({ tab: "pending" })}` },
          { key: "in_review", label: `🔍 Em revisão (${counts.in_review})`, href: `/reports?${query({ tab: "in_review" })}` },
          { key: "approved", label: `✅ Aprovados (${counts.approved})`, href: `/reports?${query({ tab: "approved" })}` },
          { key: "returned", label: `↩ Devolvidos (${counts.returned})`, href: `/reports?${query({ tab: "returned" })}` },
        ]}
      />

      <Card className="p-0">
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-4" action="/reports">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder="🔍 Buscar paciente..."
            className="w-56 rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="reports-search"
          />
          {isManager && (
            <select name="therapist" defaultValue={therapistFilter} className="rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm">
              <option value="">Todos os terapeutas</option>
              {[...therapistOptions.entries()]
                .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          )}
          <button type="submit" className={buttonClass("ghost", "sm")}>
            Filtrar
          </button>
          {(q || therapistFilter) && (
            <Link href={`/reports?tab=${tab}`} className="text-xs font-semibold text-primary">
              Limpar
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <EmptyState title="Nenhum relatório nesta aba" description={q || therapistFilter ? "Ajuste a busca ou os filtros." : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Paciente</Th>
                <Th>Terapeuta</Th>
                <Th>Tipo</Th>
                <Th>Referência</Th>
                <Th>{tab === "in_review" ? "Enviado em" : tab === "approved" ? "Aprovado em" : "Prazo"}</Th>
                {tab === "returned" && <Th>Motivo da devolução</Th>}
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const deadline = deadlineState(r, today);
                const patientName = r.patient?.full_name ?? "Paciente sem vínculo";
                const isOwner = r.therapist_id === user.id;
                return (
                  <tr key={r.id} data-testid="report-row">
                    <Td className="font-semibold text-t1">{patientName}</Td>
                    <Td>{r.therapist?.profile?.full_name ?? "—"}</Td>
                    <Td>{REPORT_TYPE_LABELS[r.report_type]}</Td>
                    <Td>{r.reference_label}</Td>
                    <Td>
                      {tab === "in_review" ? (
                        formatDate(r.submitted_at)
                      ) : tab === "approved" ? (
                        <>
                          {formatDate(r.reviewed_at)}
                          {r.reviewer && <div className="text-[11px] text-t3">por {r.reviewer.full_name}</div>}
                        </>
                      ) : (
                        <span className={cn(deadline && "font-bold text-danger")}>
                          {formatDate(r.due_date)} {deadline === "overdue" ? <Badge tone="red">Vencido</Badge> : deadline === "urgent" ? <Badge tone="red">Urgente</Badge> : null}
                        </span>
                      )}
                    </Td>
                    {tab === "returned" && <Td className="max-w-xs whitespace-pre-line text-xs">{r.return_reason}</Td>}
                    <Td>
                      <Badge tone={STATUS_TONES[r.status]}>{REPORT_STATUS_LABELS[r.status]}</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.file_path && (
                          <a href={`/files?path=${encodeURIComponent(r.file_path)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                            📄 Ver arquivo
                          </a>
                        )}
                        {isManager && r.status === "in_review" && (
                          <>
                            <ActionButton action={approveReport} fields={{ reportId: r.id }} label="✓ Aprovar" variant="primary" pendingLabel="Aprovando..." testId="report-approve" />
                            <ReturnReportModal action={returnReport} reportId={r.id} patientName={patientName} />
                          </>
                        )}
                        {user.role === "therapist" && isOwner && (r.status === "pending" || r.status === "returned") && (
                          <SubmitReportModal action={submitReport} reportId={r.id} patientName={patientName} accept={ACCEPT_ATTRIBUTE} />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {user.role === "therapist" && counts.returned > 0 && tab !== "returned" && (
        <div className="mt-5">
          <Alert tone="red">
            Você tem {counts.returned} relatório(s) devolvido(s) para correção.{" "}
            <Link href="/reports?tab=returned" className="underline">
              Ver motivos
            </Link>
          </Alert>
        </div>
      )}
    </div>
  );
}
