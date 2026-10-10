"use client";

import { useActionState, useEffect } from "react";
import { initialActionState } from "@/lib/action-state";
import { addCareAssignment, endCareAssignment } from "@/app/(app)/patients/[id]/actions";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/primitives";

type Option = { id: string; name: string };

export function AddCareAssignmentForm({
  patientId,
  therapists,
  therapies,
  today,
}: {
  patientId: string;
  therapists: Option[];
  therapies: Option[];
  today: string;
}) {
  return (
    <Modal trigger="+ Novo vínculo" title="Novo vínculo terapêutico" triggerSize="sm">
      {(close) => <AddForm patientId={patientId} therapists={therapists} therapies={therapies} today={today} onDone={close} />}
    </Modal>
  );
}

function AddForm({ patientId, therapists, therapies, today, onDone }: { patientId: string; therapists: Option[]; therapies: Option[]; today: string; onDone: () => void }) {
  const [state, formAction] = useActionState(addCareAssignment, initialActionState);
  const errors = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} data-testid="care-assignment-form">
      <FormMessage state={state} />
      <input type="hidden" name="patient_id" value={patientId} />
      <Field label="Terapeuta *" name="therapist_id" error={errors.therapist_id}>
        <Select name="therapist_id" required defaultValue="">
          <option value="">— Selecione —</option>
          {therapists.map((therapist) => (
            <option key={therapist.id} value={therapist.id}>
              {therapist.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Terapia *" name="therapy_id" error={errors.therapy_id}>
        <Select name="therapy_id" required defaultValue="">
          <option value="">— Selecione —</option>
          {therapies.map((therapy) => (
            <option key={therapy.id} value={therapy.id}>
              {therapy.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Frequência" name="frequency" error={errors.frequency}>
          <Input name="frequency" placeholder="ex: 2x por semana" />
        </Field>
        <Field label="Início *" name="starts_on" error={errors.starts_on}>
          <Input type="date" name="starts_on" defaultValue={today} required />
        </Field>
      </div>
      <p className="mb-4 text-xs text-t2">O vínculo libera ao terapeuta o acesso ao paciente, à família, ao prontuário e ao chat com os responsáveis.</p>
      <div className="flex justify-end">
        <SubmitButton>Criar vínculo</SubmitButton>
      </div>
    </form>
  );
}

export function EndCareAssignmentForm({
  assignmentId,
  patientId,
  label,
  startsOn,
  today,
}: {
  assignmentId: string;
  patientId: string;
  label: string;
  startsOn: string;
  today: string;
}) {
  return (
    <Modal trigger="Encerrar" title="Encerrar vínculo" triggerVariant="ghost" triggerSize="sm">
      {(close) => <EndForm assignmentId={assignmentId} patientId={patientId} label={label} startsOn={startsOn} today={today} onDone={close} />}
    </Modal>
  );
}

function EndForm({ assignmentId, patientId, label, startsOn, today, onDone }: { assignmentId: string; patientId: string; label: string; startsOn: string; today: string; onDone: () => void }) {
  const [state, formAction] = useActionState(endCareAssignment, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} data-testid="end-care-assignment-form">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={assignmentId} />
      <input type="hidden" name="patient_id" value={patientId} />
      <div className="mb-4 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
        <strong>{label}</strong>
        <br />
        Após a data de término, o terapeuta perde o acesso a este paciente (ficha, prontuário, plano e agenda) e deixa de poder conversar com a família pelo chat, caso não tenha outro vínculo ativo com ela.
      </div>
      <Field label="Data de término *" name="ends_on" error={state.fieldErrors?.ends_on} hint="O acesso permanece até o fim deste dia.">
        <Input type="date" name="ends_on" defaultValue={today > startsOn ? today : startsOn} min={startsOn} required />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("ghost")}>
          Cancelar
        </button>
        <SubmitButton variant="danger" pendingLabel="Encerrando...">
          Encerrar vínculo
        </SubmitButton>
      </div>
    </form>
  );
}
