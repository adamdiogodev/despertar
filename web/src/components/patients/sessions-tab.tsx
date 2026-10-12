import { createClient } from "@/lib/supabase/server";
import { durationMinutes, formatDateTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { AppointmentDetailButton } from "@/components/schedule/appointment-detail";
import { NewAppointment, type AssignmentOption } from "@/components/schedule/new-appointment";
import { STATUS_META, type Option, type ScheduleAppointment, type ScheduleViewer } from "@/components/schedule/types";
import { RegisterSession } from "./session-note-form";
import { ResolveDispute } from "./resolve-dispute";
import { SESSION_RECORD_SELECT, SessionRecordView, type SessionAttachment } from "./session-record-view";
import { canRegisterSession, familyConfirmationMeta } from "./session-record-utils";

const SELECT =
  "id, patient_id, therapist_id, room_id, starts_at, ends_at, status, notes, cancel_reason, family_confirmation, family_confirmation_note, therapy:therapies (name), room:rooms (name), therapist:therapists (color, profile:profiles (full_name))";

type SessionRecord = { content: string; therapist_id: string; session_attachments: SessionAttachment[] };

export async function SessionsTab({
  patientId,
  patientName,
  viewer,
  assignments,
  canSchedule,
  canResolveDisputes,
}: {
  patientId: string;
  patientName: string;
  viewer: ScheduleViewer;
  assignments: AssignmentOption[];
  canSchedule: boolean;
  canResolveDisputes: boolean;
}) {
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const [upcoming, past, roomsResult] = await Promise.all([
    supabase.from("appointments").select(SELECT).eq("patient_id", patientId).gte("starts_at", nowIso).order("starts_at").limit(30),
    supabase.from("appointments").select(SELECT).eq("patient_id", patientId).lt("starts_at", nowIso).order("starts_at", { ascending: false }).limit(30),
    viewer.isStaff ? supabase.from("rooms").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [] as Option[] }),
  ]);

  const rows = [...(upcoming.data ?? []), ...(past.data ?? [])];
  // RLS returns records only to managers, linked therapists and the family; reception gets none.
  const { data: notes } = rows.length
    ? await supabase.from("session_notes").select(SESSION_RECORD_SELECT).in("appointment_id", rows.map((row) => row.id))
    : { data: [] };
  const records = new Map<string, SessionRecord>((notes ?? []).map((note) => [note.appointment_id ?? "", note]));
  const rooms: Option[] = roomsResult.data ?? [];

  const toAppointment = (row: (typeof rows)[number]): ScheduleAppointment => ({
    id: row.id,
    patientId: row.patient_id,
    patientName,
    therapistId: row.therapist_id,
    therapistName: row.therapist?.profile?.full_name ?? "Terapeuta",
    therapistColor: row.therapist?.color ?? "#2E86DE",
    therapyName: row.therapy?.name ?? "—",
    roomId: row.room_id,
    roomName: row.room?.name ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes,
    cancelReason: row.cancel_reason,
    familyConfirmation: row.family_confirmation,
    familyConfirmationNote: row.family_confirmation_note,
  });

  const renderList = (title: string, list: typeof rows, empty: string) => (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle
          action={
            title === "Próximas sessões" && canSchedule ? (
              <NewAppointment
                trigger="+ Nova sessão"
                assignments={assignments}
                rooms={rooms}
                defaultDate={localDateKey(now)}
                defaultPatientId={patientId}
              />
            ) : undefined
          }
        >
          {title}
        </CardTitle>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="📅" title={empty} />
      ) : (
        <ul>
          {list.map((row) => {
            const appointment = toAppointment(row);
            const record = records.get(row.id);
            const confirmation = familyConfirmationMeta(row.status, row.family_confirmation, row.family_confirmation_note);
            const canRegister = canRegisterSession(
              { therapistId: row.therapist_id, status: row.status, startsAt: row.starts_at, hasRecord: Boolean(record) },
              viewer.userId,
              now,
            );
            return (
              <li key={row.id} id={`session-${row.id}`} className="scroll-mt-20 border-t border-line-light px-5 py-4" data-testid="session-row">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-t1">
                      {formatDateTime(row.starts_at)} · {appointment.therapyName}
                    </div>
                    <div className="text-xs text-t2">
                      {appointment.therapistName}
                      {appointment.roomName && ` · ${appointment.roomName}`} · {durationMinutes(row.starts_at, row.ends_at)} min
                      {row.status === "canceled" && row.cancel_reason && ` · Motivo: ${row.cancel_reason}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>
                    {confirmation && (
                      <Badge tone={confirmation.tone} className="max-w-xs truncate">
                        <span title={confirmation.label} data-testid="family-confirmation">
                          {confirmation.label}
                        </span>
                      </Badge>
                    )}
                    {canResolveDisputes && row.status === "completed" && row.family_confirmation === "disputed" && (
                      <ResolveDispute appointmentId={row.id} patientId={patientId} familyNote={row.family_confirmation_note} />
                    )}
                    {canRegister && (
                      <RegisterSession
                        patientId={patientId}
                        appointment={{
                          id: row.id,
                          date: localDateKey(row.starts_at),
                          label: `${formatDateTime(row.starts_at)} · ${appointment.therapyName}`,
                          minutes: durationMinutes(row.starts_at, row.ends_at),
                        }}
                      />
                    )}
                    <AppointmentDetailButton appointment={appointment} viewer={viewer} rooms={rooms} />
                  </div>
                </div>
                {record && (
                  <div className="mt-3">
                    <SessionRecordView content={record.content} attachments={record.session_attachments} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="grid gap-6">
      <Alert tone="blue">
        👪 O registro de cada sessão (texto e fotos) é compartilhado com a família, que confirma no portal se a sessão foi realizada.
      </Alert>
      {renderList("Próximas sessões", upcoming.data ?? [], "Nenhuma sessão agendada.")}
      {renderList("Sessões anteriores", past.data ?? [], "Nenhuma sessão realizada ainda.")}
    </div>
  );
}
