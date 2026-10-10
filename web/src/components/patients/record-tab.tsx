import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { Alert, Avatar, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { EditSessionNote, SessionNoteForm, type CompletedSessionOption } from "./session-note-form";

export async function RecordTab({ patientId, userId, canWrite, today }: { patientId: string; userId: string; canWrite: boolean; today: string }) {
  const supabase = await createClient();

  // LGPD: every opening of the clinical record is audited.
  const { error: auditError } = await supabase.rpc("log_record_access", { target_patient: patientId });
  if (auditError) {
    return <Alert tone="red">Você não tem permissão para acessar o prontuário deste paciente.</Alert>;
  }

  const [notesResult, sessionsResult] = await Promise.all([
    supabase
      .from("session_notes")
      .select(
        "id, session_date, content, appointment_id, therapist_id, created_at, updated_at, therapist:therapists (color, profile:profiles (full_name)), appointment:appointments (starts_at, therapy:therapies (name))",
      )
      .eq("patient_id", patientId)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false }),
    canWrite
      ? supabase
          .from("appointments")
          .select("id, starts_at, therapy:therapies (name)")
          .eq("patient_id", patientId)
          .eq("therapist_id", userId)
          .eq("status", "completed")
          .order("starts_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { id: string; starts_at: string; therapy: { name: string } | null }[] }),
  ]);

  const notes = notesResult.data ?? [];
  const usedAppointments = new Set(notes.map((note) => note.appointment_id).filter(Boolean));
  const sessionOptions: CompletedSessionOption[] = (sessionsResult.data ?? []).map((session) => ({
    id: session.id,
    label: `${formatDateTime(session.starts_at)} · ${session.therapy?.name ?? ""}`,
  }));
  const freeSessions = sessionOptions.filter((session) => !usedAppointments.has(session.id));

  return (
    <div className="grid gap-6">
      <Alert tone="purple">🔒 Prontuário sigiloso. O acesso é registrado para auditoria (LGPD).</Alert>

      {canWrite && (
        <Card>
          <CardTitle>Nova evolução</CardTitle>
          <SessionNoteForm patientId={patientId} today={today} sessions={freeSessions} />
        </Card>
      )}

      <Card>
        <CardTitle>Evoluções</CardTitle>
        {notes.length === 0 ? (
          <EmptyState icon="📝" title="Nenhuma evolução registrada" />
        ) : (
          <ol className="relative border-l-2 border-line pl-6">
            {notes.map((note) => {
              const author = note.therapist?.profile?.full_name ?? "Terapeuta";
              const isMine = canWrite && note.therapist_id === userId;
              return (
                <li key={note.id} className="mb-6 last:mb-0" data-testid="session-note">
                  <span className="absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-white bg-primary" aria-hidden />
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={author} color={note.therapist?.color ?? undefined} size={28} />
                      <div>
                        <div className="text-sm font-semibold text-t1">{author}</div>
                        <div className="text-xs text-t3">
                          {formatDate(note.session_date)}
                          {note.appointment && ` · Sessão de ${formatDateTime(note.appointment.starts_at)}${note.appointment.therapy ? ` (${note.appointment.therapy.name})` : ""}`}
                          {note.updated_at !== note.created_at && " · editada"}
                        </div>
                      </div>
                    </div>
                    {isMine && (
                      <EditSessionNote
                        patientId={patientId}
                        today={today}
                        sessions={sessionOptions.filter((session) => session.id === note.appointment_id || !usedAppointments.has(session.id))}
                        note={{ id: note.id, session_date: note.session_date, appointment_id: note.appointment_id, content: note.content }}
                      />
                    )}
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-page px-4 py-3 text-sm leading-relaxed text-t1">{note.content}</p>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
