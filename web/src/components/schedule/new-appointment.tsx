"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { DEFAULT_DURATION_MINUTES } from "@/lib/schedule";
import { createAppointments, type CreateAppointmentsState } from "@/app/(app)/schedule/actions";
import type { Option } from "./types";

export type AssignmentOption = {
  patientId: string;
  patientName: string;
  therapistId: string;
  therapistName: string;
  therapyId: string;
  therapyName: string;
};

const initialState: CreateAppointmentsState = { ok: false };

type Props = { assignments: AssignmentOption[]; rooms: Option[]; defaultDate: string; defaultPatientId?: string; trigger?: string };

export function NewAppointment({ trigger = "+ Novo agendamento", ...props }: Props) {
  return (
    <Modal trigger={trigger} title="Novo agendamento" triggerSize="sm">
      {() => <NewAppointmentForm {...props} />}
    </Modal>
  );
}

function NewAppointmentForm({ assignments, rooms, defaultDate, defaultPatientId }: Props) {
  const [state, action] = useActionState(createAppointments, initialState);
  const [patientId, setPatientId] = useState(defaultPatientId ?? "");
  const patients = [...new Map(assignments.map((item) => [item.patientId, item.patientName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const patientAssignments = assignments.filter((item) => item.patientId === patientId);

  return (
    <form action={action} data-testid="new-appointment-form">
      <FormMessage state={state} />
      {state.results && (
        <ul className="mb-4 space-y-1 rounded-lg border border-line p-3 text-xs" data-testid="recurrence-results">
          {state.results.map((result) => (
            <li key={result.date} className={result.ok ? "text-ok" : "text-danger"}>
              {result.ok ? "✓" : "✗"} {formatDate(result.date)}
              {result.error && ` — ${result.error}`}
            </li>
          ))}
        </ul>
      )}
      <Field label="Paciente" name="patient_id" error={state.fieldErrors?.patient_id}>
        <Select name="patient_id" value={patientId} onChange={(event) => setPatientId(event.target.value)} required>
          <option value="">Selecione...</option>
          {patients.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Terapeuta e terapia"
        name="assignment"
        error={state.fieldErrors?.assignment}
        hint={patientId && patientAssignments.length === 0 ? "Paciente sem vínculo vigente." : "Somente vínculos vigentes do paciente."}
      >
        <Select name="assignment" key={patientId} required disabled={!patientId}>
          {patientAssignments.length !== 1 && <option value="">Selecione...</option>}
          {patientAssignments.map((item) => (
            <option key={`${item.therapistId}:${item.therapyId}`} value={`${item.therapistId}:${item.therapyId}`}>
              {item.therapistName} — {item.therapyName}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Data" name="date" error={state.fieldErrors?.date}>
          <Input name="date" type="date" defaultValue={defaultDate} required />
        </Field>
        <Field label="Hora" name="time" error={state.fieldErrors?.time}>
          <Input name="time" type="time" defaultValue="08:00" required />
        </Field>
        <Field label="Duração (min)" name="duration" error={state.fieldErrors?.duration}>
          <Input name="duration" type="number" min={10} max={480} defaultValue={DEFAULT_DURATION_MINUTES} required />
        </Field>
        <Field label="Sala" name="room_id">
          <Select name="room_id" defaultValue="">
            <option value="">Sem sala</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Repetir por (semanas)" name="weeks" error={state.fieldErrors?.weeks} hint="1 = sessão única">
          <Input name="weeks" type="number" min={1} max={26} defaultValue={1} required />
        </Field>
      </div>
      <Field label="Observações" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Agendando...">Agendar</SubmitButton>
      </div>
    </form>
  );
}
