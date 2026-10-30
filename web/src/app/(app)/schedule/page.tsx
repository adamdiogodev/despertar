import { LinkButton, PageHeader, StatCard } from "@/components/ui/primitives";
import { NewAppointment, type AssignmentOption } from "@/components/schedule/new-appointment";
import { loadSchedulingOptions } from "@/components/schedule/scheduling-options";
import { ScheduleFilters } from "@/components/schedule/schedule-filters";
import { ScheduleView } from "@/components/schedule/schedule-view";
import type { Option, ScheduleAppointment } from "@/components/schedule/types";
import { STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { localDateKey } from "@/lib/format";
import { addDays, resolveWeek, weekDays, weekLabel, weekRange, weekStart } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const user = await requireRole(TEAM_ROLES);
  const isStaff = STAFF_ROLES.includes(user.role);
  const params = await searchParams;
  const todayKey = localDateKey(new Date());
  const week = resolveWeek(params.week, todayKey);
  const days = weekDays(week);
  const { from, to } = weekRange(week);

  const therapistFilter = isStaff ? single(params.therapist) : undefined;
  const roomFilter = isStaff ? single(params.room) : undefined;
  const scope = single(params.scope) === "all" ? "all" : "mine";

  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(
      "id, patient_id, therapist_id, room_id, starts_at, ends_at, status, notes, cancel_reason, family_confirmation, family_confirmation_note, patients(full_name), therapies(name), rooms(name), therapists(color, profiles(full_name))",
    )
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");
  if (therapistFilter && UUID.test(therapistFilter)) query = query.eq("therapist_id", therapistFilter);
  if (roomFilter && UUID.test(roomFilter)) query = query.eq("room_id", roomFilter);
  // RLS also returns colleagues' sessions with shared patients; therapists see their own by default.
  if (!isStaff && scope === "mine") query = query.eq("therapist_id", user.id);

  const [{ data: rows, error }, { data: roomRows }, therapistsResult, scheduling, pendingResult] = await Promise.all([
    query,
    supabase.from("rooms").select("id, name").eq("active", true).order("name"),
    isStaff ? supabase.from("therapists").select("id, profiles(full_name, active)") : Promise.resolve({ data: null }),
    isStaff ? loadSchedulingOptions() : Promise.resolve(null),
    isStaff
      ? supabase.from("reschedule_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
  ]);
  if (error) throw new Error(error.message);

  const appointments: ScheduleAppointment[] = (rows ?? []).map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? "Paciente",
    therapistId: row.therapist_id,
    therapistName: row.therapists?.profiles?.full_name ?? "Terapeuta",
    therapistColor: row.therapists?.color ?? "#2E86DE",
    therapyName: row.therapies?.name ?? "—",
    roomId: row.room_id,
    roomName: row.rooms?.name ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes,
    cancelReason: row.cancel_reason,
    familyConfirmation: row.family_confirmation,
    familyConfirmationNote: row.family_confirmation_note,
  }));

  const rooms: Option[] = roomRows ?? [];
  const therapists: Option[] = (therapistsResult.data ?? [])
    .filter((row) => row.profiles?.active)
    .map((row) => ({ id: row.id, name: row.profiles?.full_name ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const assignments: AssignmentOption[] = scheduling?.assignments ?? [];
  const pendingRequests = pendingResult.count ?? 0;

  const count = (status: ScheduleAppointment["status"]) => appointments.filter((item) => item.status === status).length;
  const href = (target: string) => {
    const next = new URLSearchParams();
    next.set("week", target);
    if (therapistFilter) next.set("therapist", therapistFilter);
    if (roomFilter) next.set("room", roomFilter);
    if (!isStaff && scope === "all") next.set("scope", "all");
    return `/schedule?${next.toString()}`;
  };
  const currentWeek = weekStart(todayKey);

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Visualização semanal de atendimentos e horários"
        actions={
          isStaff && (
            <>
              <LinkButton href="/schedule/requests" variant="outline" size="sm">
                Remarcações{pendingRequests > 0 && ` (${pendingRequests})`}
              </LinkButton>
              <NewAppointment assignments={assignments} rooms={rooms} defaultDate={week === currentWeek ? todayKey : week} />
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <LinkButton href={href(addDays(week, -7))} variant="ghost" size="sm" aria-label="Semana anterior">
            ‹
          </LinkButton>
          <span className="min-w-44 text-center text-[15px] font-bold text-t1" data-testid="week-label">
            {weekLabel(week)}
          </span>
          <LinkButton href={href(addDays(week, 7))} variant="ghost" size="sm" aria-label="Próxima semana">
            ›
          </LinkButton>
          {week !== currentWeek && (
            <LinkButton href={href(currentWeek)} variant="outline" size="sm">
              Hoje
            </LinkButton>
          )}
        </div>
        <div className="sm:ml-auto">
          <ScheduleFilters
            week={week}
            isStaff={isStaff}
            therapists={therapists}
            rooms={rooms}
            therapist={therapistFilter}
            room={roomFilter}
            scope={scope}
          />
        </div>
      </div>

      <ScheduleView appointments={appointments} days={days} todayKey={todayKey} viewer={{ userId: user.id, isStaff }} rooms={rooms} />

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" data-testid="schedule-kpis">
        <StatCard label="Total na semana" value={appointments.length} hint="sessões" tone="blue" />
        <StatCard label="Confirmadas" value={count("confirmed")} tone="green" />
        <StatCard label="Concluídas" value={count("completed")} tone="purple" />
        <StatCard label="Canceladas" value={count("canceled")} tone="gray" />
        <StatCard label="Faltas" value={count("no_show")} tone="red" />
      </div>
    </div>
  );
}
