import Link from "next/link";
import { STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, localDateKey } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, buttonClass, cn } from "@/components/ui/primitives";
import { NewAppointment } from "@/components/schedule/new-appointment";
import { loadSchedulingOptions } from "@/components/schedule/scheduling-options";
import {
  PAGE_SIZE,
  RECORD_STATUSES,
  STATUS_META,
  isAssignmentActive,
  isRecordStatus,
  likePattern,
  parsePage,
  patientsListHref,
  type ListParams,
} from "@/components/patients/patient-helpers";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function PatientsPage({ searchParams }: PageProps<"/patients">) {
  const user = await requireRole(TEAM_ROLES);
  const isStaff = STAFF_ROLES.includes(user.role);
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const therapy = typeof sp.therapy === "string" && UUID_RE.test(sp.therapy) ? sp.therapy : "";
  const status = isRecordStatus(sp.status) ? sp.status : "";
  const page = parsePage(sp.page);
  const current: ListParams = { q, therapy, status, page };

  const supabase = await createClient();
  const today = localDateKey(new Date());

  const { data: therapies } = await supabase.from("therapies").select("id, name").eq("active", true).order("name");

  // Therapy filter: patients with a current assignment in that therapy (RLS already scopes therapists).
  let patientIdsForTherapy: string[] | null = null;
  if (therapy) {
    const { data } = await supabase
      .from("care_assignments")
      .select("patient_id")
      .eq("therapy_id", therapy)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`);
    patientIdsForTherapy = [...new Set((data ?? []).map((row) => row.patient_id))];
  }

  let query = supabase
    .from("patients")
    .select(
      `id, full_name, birth_date, insurance_name, status,
       family:families (id, name),
       care_assignments (id, starts_on, ends_on, therapy:therapies (name), therapist:therapists (id, color, profile:profiles (full_name)))`,
      { count: "exact" },
    )
    .order("full_name");
  if (q) query = query.ilike("full_name", likePattern(q));
  if (status) query = query.eq("status", status);
  if (patientIdsForTherapy) query = query.in("id", patientIdsForTherapy.length ? patientIdsForTherapy : ["00000000-0000-0000-0000-000000000000"]);

  const from = (page - 1) * PAGE_SIZE;
  const { data: patients, count } = await query.range(from, from + PAGE_SIZE - 1);
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const scheduling = isStaff && patients?.length ? await loadSchedulingOptions({ patientIds: patients.map((patient) => patient.id) }) : null;

  let kpis: { total: number; active: number; inactive: number; newThisMonth: number } | null = null;
  if (isStaff) {
    const monthStart = `${today.slice(0, 7)}-01T00:00:00-03:00`;
    const countAll = () => supabase.from("patients").select("id", { count: "exact", head: true });
    const [all, active, inactive, newThisMonth] = await Promise.all([
      countAll(),
      countAll().eq("status", "active"),
      countAll().eq("status", "inactive"),
      countAll().gte("created_at", monthStart),
    ]);
    kpis = { total: all.count ?? 0, active: active.count ?? 0, inactive: inactive.count ?? 0, newThisMonth: newThisMonth.count ?? 0 };
  }

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={isStaff ? "Gerenciamento de pacientes e cadastros da clínica" : "Pacientes vinculados a você"}
        actions={
          isStaff && (
            <LinkButton href="/patients/new" data-testid="new-patient">
              + Novo paciente
            </LinkButton>
          )
        }
      />

      {kpis && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total de pacientes" value={kpis.total} icon="👥" tone="blue" />
          <StatCard label="Ativos" value={kpis.active} icon="✅" tone="green" hint={`${kpis.total - kpis.active - kpis.inactive} pendentes`} />
          <StatCard label="Inativos" value={kpis.inactive} icon="⏸" tone="gray" />
          <StatCard label="Novos este mês" value={kpis.newThisMonth} icon="🔄" tone="purple" />
        </div>
      )}

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold text-t1">Pacientes cadastrados</h2>
          <form method="get" action="/patients" className="flex flex-wrap items-center gap-2" data-testid="patients-filters">
            <input
              name="q"
              defaultValue={q}
              placeholder="🔍 Buscar paciente..."
              className="rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <select name="therapy" defaultValue={therapy} className="rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm">
              <option value="">Todas as terapias</option>
              {(therapies ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={status} className="rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm">
              <option value="">Todos os status</option>
              {RECORD_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("ghost", "sm")}>
              Filtrar
            </button>
          </form>
        </div>

        {!patients?.length ? (
          <EmptyState icon="🧒" title="Nenhum paciente encontrado" description={q || therapy || status ? "Ajuste os filtros da busca." : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Paciente</Th>
                <Th>Família</Th>
                <Th>Terapeutas</Th>
                <Th>Terapias</Th>
                <Th>Convênio</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const active = patient.care_assignments.filter((ca) => isAssignmentActive(ca.starts_on, ca.ends_on, today));
                const therapists = [...new Map(active.map((ca) => [ca.therapist?.id, ca.therapist?.profile?.full_name])).values()].filter(Boolean);
                const therapyNames = [...new Set(active.map((ca) => ca.therapy?.name).filter(Boolean))];
                const age = ageFrom(patient.birth_date);
                const meta = STATUS_META[patient.status];
                return (
                  <tr key={patient.id} className="hover:bg-line-light/50" data-testid="patient-row">
                    <Td>
                      <Link href={`/patients/${patient.id}`} className="flex items-center gap-3">
                        <Avatar name={patient.full_name} color={active[0]?.therapist?.color ?? undefined} />
                        <div>
                          <div className="font-semibold text-t1">{patient.full_name}</div>
                          <div className="text-xs text-t3">{age != null ? `${age} anos` : "—"}</div>
                        </div>
                      </Link>
                    </Td>
                    <Td>
                      {patient.family ? (
                        <Link href={`/families/${patient.family.id}`} className="text-primary hover:underline">
                          {patient.family.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{therapists.length ? therapists.join(", ") : <span className="text-t3">Sem vínculo</span>}</Td>
                    <Td>{therapyNames.length ? therapyNames.join(", ") : "—"}</Td>
                    <Td>{patient.insurance_name}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <LinkButton href={`/patients/${patient.id}`} variant="ghost" size="sm">
                        📋 Ficha
                      </LinkButton>
                      {scheduling?.assignments.some((item) => item.patientId === patient.id) && (
                        <span className="ml-1 inline-block">
                          <NewAppointment
                            trigger="📅 Agendar"
                            triggerVariant="ghost"
                            assignments={scheduling.assignments.filter((item) => item.patientId === patient.id)}
                            rooms={scheduling.rooms}
                            defaultDate={today}
                            defaultPatientId={patient.id}
                          />
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs text-t2">
          <span>
            Mostrando {patients?.length ?? 0} de {total} registro{total === 1 ? "" : "s"}
          </span>
          {pageCount > 1 && (
            <nav className="flex gap-1" aria-label="Paginação">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <Link
                  key={number}
                  href={patientsListHref(current, { page: number })}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-semibold",
                    number === page ? "border-primary bg-primary text-white" : "border-line text-t2 hover:bg-line-light",
                  )}
                  aria-current={number === page ? "page" : undefined}
                >
                  {number}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </Card>
    </>
  );
}
