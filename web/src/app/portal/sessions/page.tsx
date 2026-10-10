import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { durationMinutes, formatDateTime, formatTime } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ChildSwitcher, ClinicContact } from "@/components/portal/child-switcher";
import { loadClinicSettings, loadPortalChildren } from "@/components/portal/data";
import { SessionActions } from "@/components/portal/session-actions";
import { cancelAppointment, requestReschedule } from "./actions";

const STATUS = {
  scheduled: { label: "Agendada", tone: "blue" },
  confirmed: { label: "Confirmada", tone: "green" },
  completed: { label: "Realizada", tone: "gray" },
  no_show: { label: "Falta", tone: "yellow" },
  canceled: { label: "Cancelada", tone: "red" },
} as const;

const REQUEST_STATUS = {
  pending: { label: "Aguardando a clínica", tone: "yellow" },
  approved: { label: "Aprovada", tone: "green" },
  rejected: { label: "Recusada", tone: "red" },
} as const;

const APPOINTMENT_FIELDS =
  "id, patient_id, starts_at, ends_at, status, cancel_reason, rooms(name), therapies(name), therapists(profiles(full_name)), patients(full_name)";

type Session = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: keyof typeof STATUS;
  cancel_reason: string | null;
  rooms: { name: string } | null;
  therapies: { name: string } | null;
  therapists: { profiles: { full_name: string } | null } | null;
  patients: { full_name: string } | null;
};

function DateBlock({ value }: { value: string }) {
  const date = new Date(value);
  const day = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit" });
  const month = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "short" }).replace(".", "");
  const weekday = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short" }).replace(".", "");
  return (
    <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-primary-light py-1.5 text-primary">
      <span className="text-[10px] font-semibold uppercase">{weekday}</span>
      <span className="text-lg font-extrabold leading-none">{day}</span>
      <span className="text-[10px] font-semibold uppercase">{month}</span>
    </div>
  );
}

function SessionInfo({ session }: { session: Session }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="font-bold text-t1">
        {session.patients?.full_name} — {session.therapies?.name}
      </div>
      <div className="text-xs text-t2">
        {formatTime(session.starts_at)} · {session.therapists?.profiles?.full_name ?? "Terapeuta"}
        {session.rooms?.name && ` · ${session.rooms.name}`} · {durationMinutes(session.starts_at, session.ends_at)} min
      </div>
      {session.status === "canceled" && session.cancel_reason && <div className="mt-0.5 text-xs text-t3">Motivo: {session.cancel_reason}</div>}
    </div>
  );
}

export default async function PortalSessionsPage({ searchParams }: PageProps<"/portal/sessions">) {
  await requireRole(["guardian"]);
  const { child } = await searchParams;
  const [{ children, selectedId, patientIds }, clinic] = await Promise.all([loadPortalChildren(child), loadClinicSettings()]);
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [upcomingRes, historyRes, requestsRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(APPOINTMENT_FIELDS)
      .in("patient_id", patientIds)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", nowIso)
      .order("starts_at")
      .limit(60),
    supabase
      .from("appointments")
      .select(APPOINTMENT_FIELDS)
      .in("patient_id", patientIds)
      .or(`starts_at.lt."${nowIso}",status.eq.canceled`)
      .order("starts_at", { ascending: false })
      .limit(40),
    supabase
      .from("reschedule_requests")
      .select("id, appointment_id, proposed_starts_at, reason, status, decision_note, created_at, appointments(starts_at, patient_id, patients(full_name), therapies(name))")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const upcoming = (upcomingRes.data ?? []) as Session[];
  const history = (historyRes.data ?? []) as Session[];
  const requests = (requestsRes.data ?? []).filter((r) => r.appointments && patientIds.includes(r.appointments.patient_id));
  const pendingAppointments = new Set(requests.filter((r) => r.status === "pending").map((r) => r.appointment_id));
  const minHours = clinic.reschedule_min_hours;

  return (
    <div>
      <PageHeader title="Sessões" description="Acompanhe os atendimentos e peça remarcações quando precisar." />
      <ChildSwitcher items={children} selectedId={selectedId} basePath="/portal/sessions" />

      <Alert tone="blue">
        📌 Remarcações e cancelamentos devem ser solicitados com pelo menos <strong>{minHours} horas de antecedência</strong>. Em cima da hora?
        Fale com a clínica: <ClinicContact phone={clinic.phone} whatsapp={clinic.whatsapp} />
      </Alert>

      <Card className="mb-6 p-0">
        <div className="px-5 pt-5">
          <CardTitle>Próximos atendimentos</CardTitle>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon="📅" title="Nenhuma sessão agendada" description="Quando a clínica agendar novas sessões, elas aparecem aqui." />
        ) : (
          <ul>
            {upcoming.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-4 border-t border-line-light px-5 py-3" data-testid="upcoming-session">
                <DateBlock value={session.starts_at} />
                <SessionInfo session={session} />
                <div className="flex flex-wrap items-center gap-2">
                  {pendingAppointments.has(session.id) ? (
                    <Badge tone="yellow">Remarcação solicitada</Badge>
                  ) : (
                    <Badge tone={STATUS[session.status].tone}>{STATUS[session.status].label}</Badge>
                  )}
                  <SessionActions
                    appointmentId={session.id}
                    startsAt={session.starts_at}
                    label={`${session.patients?.full_name} — ${formatDateTime(session.starts_at)}`}
                    minHours={minHours}
                    hasPendingRequest={pendingAppointments.has(session.id)}
                    clinicPhone={clinic.phone}
                    clinicWhatsapp={clinic.whatsapp}
                    rescheduleAction={requestReschedule}
                    cancelAction={cancelAppointment}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {requests.length > 0 && (
        <Card className="mb-6">
          <CardTitle>Minhas solicitações de remarcação</CardTitle>
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line-light p-3" data-testid="reschedule-request">
                <div className="text-sm">
                  <div className="font-semibold text-t1">
                    {r.appointments?.patients?.full_name} — {r.appointments?.therapies?.name}
                  </div>
                  <div className="text-xs text-t2">
                    De {r.appointments ? formatDateTime(r.appointments.starts_at) : "—"} para <strong>{formatDateTime(r.proposed_starts_at)}</strong>
                  </div>
                  <div className="text-xs text-t3">Motivo: {r.reason}</div>
                  {r.decision_note && <div className="mt-1 text-xs text-t2">Resposta da clínica: {r.decision_note}</div>}
                </div>
                <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardTitle>Histórico</CardTitle>
        </div>
        {history.length === 0 ? (
          <EmptyState icon="🗂" title="Ainda não há sessões no histórico" />
        ) : (
          <ul>
            {history.map((session) => {
              const status = session.status === "scheduled" || session.status === "confirmed" ? null : STATUS[session.status];
              return (
                <li key={session.id} className="flex flex-wrap items-center gap-4 border-t border-line-light px-5 py-3 opacity-90" data-testid="past-session">
                  <DateBlock value={session.starts_at} />
                  <SessionInfo session={session} />
                  {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="gray">Aguardando registro</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
