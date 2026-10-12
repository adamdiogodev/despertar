"use client";

import { useActionState, useEffect } from "react";
import { initialActionState } from "@/lib/action-state";
import { resolveSessionDispute } from "@/app/(app)/patients/[id]/actions";
import { Field, FormMessage, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

// Managers decide a session the family disputed: it stays out of the therapist's
// NF until it is either kept (the clinic checked it happened) or canceled.
export function ResolveDispute({ appointmentId, patientId, familyNote }: { appointmentId: string; patientId: string; familyNote: string | null }) {
  return (
    <Modal trigger="Resolver contestação" title="Resolver contestação da família" triggerVariant="danger" triggerSize="sm">
      {(close) => <ResolveDisputeForm appointmentId={appointmentId} patientId={patientId} familyNote={familyNote} onDone={close} />}
    </Modal>
  );
}

function ResolveDisputeForm({
  appointmentId,
  patientId,
  familyNote,
  onDone,
}: {
  appointmentId: string;
  patientId: string;
  familyNote: string | null;
  onDone: () => void;
}) {
  const [state, action] = useActionState(resolveSessionDispute, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} data-testid="resolve-dispute-form">
      <FormMessage state={state} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="patient_id" value={patientId} />
      {familyNote && (
        <p className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          A família disse: <strong>{familyNote}</strong>
        </p>
      )}
      <p className="mb-4 text-sm text-t2">Enquanto a contestação não for resolvida, esta sessão fica fora da nota fiscal do terapeuta.</p>
      <Field label="Decisão *" name="happened" error={errors.happened}>
        <Select name="happened" defaultValue="" required>
          <option value="" disabled>
            Selecione...
          </option>
          <option value="yes">A sessão aconteceu — manter (entra na nota fiscal)</option>
          <option value="no">A sessão não aconteceu — cancelar</option>
        </Select>
      </Field>
      <Field label="Explicação *" name="note" error={errors.note} hint="A família e o terapeuta recebem esta explicação.">
        <Textarea name="note" rows={3} minLength={3} required placeholder="Ex.: conferido na lista de presença da recepção." />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Salvando...">Salvar decisão</SubmitButton>
      </div>
    </form>
  );
}
