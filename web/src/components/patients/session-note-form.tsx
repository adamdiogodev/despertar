"use client";

import { useActionState, useEffect } from "react";
import { initialActionState } from "@/lib/action-state";
import { saveSessionNote } from "@/app/(app)/patients/[id]/actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { MAX_SUBMISSION_BYTES, SESSION_MEDIA_ACCEPT } from "./session-record-utils";

export type CompletedSessionOption = { id: string; label: string };

type NoteValues = { id: string; session_date: string; appointment_id: string | null; content: string };

type FixedAppointment = { id: string; date: string; label: string };

export function SessionNoteForm({
  patientId,
  today,
  sessions,
  note,
  fixedAppointment,
  onDone,
}: {
  patientId: string;
  today: string;
  sessions: CompletedSessionOption[];
  note?: NoteValues;
  fixedAppointment?: FixedAppointment;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(saveSessionNote, initialActionState);
  const formRef = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);

  if (state.ok && fixedAppointment) {
    return (
      <div className="text-center" data-testid="session-registered">
        <div className="mb-3 text-4xl">✅</div>
        <FormMessage state={state} />
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} data-testid={note ? "edit-note-form" : "new-note-form"}>
      <FormMessage state={state} />
      <input type="hidden" name="patient_id" value={patientId} />
      {note && <input type="hidden" name="id" value={note.id} />}
      {fixedAppointment ? (
        <>
          <input type="hidden" name="appointment_id" value={fixedAppointment.id} />
          <input type="hidden" name="session_date" value={fixedAppointment.date} />
          <p className="mb-4 text-sm text-t2">
            Sessão: <strong className="text-t1">{fixedAppointment.label}</strong>. Ao salvar, a sessão fica como concluída.
          </p>
        </>
      ) : (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Data *" name="session_date" error={errors.session_date}>
            <Input type="date" name="session_date" defaultValue={note?.session_date ?? today} max={today} required />
          </Field>
          <Field label="Sessão (opcional)" name="appointment_id" error={errors.appointment_id}>
            <Select name="appointment_id" defaultValue={note?.appointment_id ?? ""}>
              <option value="">— Sem sessão vinculada —</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <p className="mb-3 rounded-lg bg-info-bg px-3 py-2 text-xs font-medium text-info" data-testid="family-visible-notice">
        👪 Visível para a família: o texto e os anexos aparecem no portal dos responsáveis, que confirmam se a sessão foi realizada.
      </p>
      <Field label="Registro da sessão *" name="content" error={errors.content}>
        <Textarea name="content" rows={note ? 8 : 5} defaultValue={note?.content ?? ""} placeholder="Como foi a sessão, o que foi trabalhado..." required />
      </Field>
      <Field
        label={note ? "Adicionar fotos ou anexos" : "Fotos e anexos"}
        name="attachments"
        error={errors.attachments}
        hint="Fotos, vídeos ou PDF — até 20 MB no total por envio."
      >
        <Input
          type="file"
          name="attachments"
          multiple
          accept={SESSION_MEDIA_ACCEPT}
          onChange={(event) => {
            const total = [...(event.target.files ?? [])].reduce((sum, file) => sum + file.size, 0);
            event.target.setCustomValidity(total > MAX_SUBMISSION_BYTES ? "Os anexos passam de 20 MB no total. Envie em partes." : "");
          }}
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando...">{note ? "Salvar registro" : fixedAppointment ? "Registrar sessão" : "Salvar registro"}</SubmitButton>
      </div>
    </form>
  );
}

export function EditSessionNote(props: { patientId: string; today: string; sessions: CompletedSessionOption[]; note: NoteValues }) {
  return (
    <Modal trigger="Editar" title="Editar registro da sessão" triggerVariant="ghost" triggerSize="sm" wide>
      {(close) => <SessionNoteForm {...props} onDone={close} />}
    </Modal>
  );
}

export function RegisterSession({ patientId, appointment }: { patientId: string; appointment: FixedAppointment }) {
  return (
    <Modal trigger="📝 Registrar sessão" title="Registro da sessão" triggerVariant="primary" triggerSize="sm" wide>
      {(close) => (
        <>
          <SessionNoteForm patientId={patientId} today={appointment.date} sessions={[]} fixedAppointment={appointment} />
          <div className="mt-2 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Fechar
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
