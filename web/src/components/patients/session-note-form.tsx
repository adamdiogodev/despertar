"use client";

import { useActionState, useEffect } from "react";
import { initialActionState } from "@/lib/action-state";
import { saveSessionNote } from "@/app/(app)/patients/[id]/actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

export type CompletedSessionOption = { id: string; label: string };

type NoteValues = { id: string; session_date: string; appointment_id: string | null; content: string };

export function SessionNoteForm({
  patientId,
  today,
  sessions,
  note,
  onDone,
}: {
  patientId: string;
  today: string;
  sessions: CompletedSessionOption[];
  note?: NoteValues;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(saveSessionNote, initialActionState);
  const formRef = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form ref={formRef} action={formAction} data-testid={note ? "edit-note-form" : "new-note-form"}>
      <FormMessage state={state} />
      <input type="hidden" name="patient_id" value={patientId} />
      {note && <input type="hidden" name="id" value={note.id} />}
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
      <Field label="Evolução *" name="content" error={errors.content}>
        <Textarea name="content" rows={note ? 8 : 5} defaultValue={note?.content ?? ""} placeholder="Descreva a evolução da sessão..." required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>{note ? "Salvar evolução" : "Registrar evolução"}</SubmitButton>
      </div>
    </form>
  );
}

export function EditSessionNote(props: { patientId: string; today: string; sessions: CompletedSessionOption[]; note: NoteValues }) {
  return (
    <Modal trigger="Editar" title="Editar evolução" triggerVariant="ghost" triggerSize="sm" wide>
      {(close) => <SessionNoteForm {...props} onDone={close} />}
    </Modal>
  );
}
