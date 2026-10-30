"use client";

import { useActionState, useState, type ComponentProps } from "react";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { DEFAULT_DURATION_MINUTES, SCHEDULABLE_WEEKDAYS, WEEKDAY_SHORT, weekdayOf } from "@/lib/schedule";
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

type Props = {
  assignments: AssignmentOption[];
  rooms: Option[];
  defaultDate: string;
  defaultPatientId?: string;
  // "therapistId:therapyId" — preselects the care assignment.
  defaultAssignment?: string;
  trigger?: string;
  triggerVariant?: ComponentProps<typeof Modal>["triggerVariant"];
};

export function NewAppointment({ trigger = "+ Novo agendamento", triggerVariant, ...props }: Props) {
  return (
    <Modal trigger={trigger} title="Novo agendamento" triggerSize="sm" triggerVariant={triggerVariant}>
      {() => <NewAppointmentForm {...props} />}
    </Modal>
  );
}

function NewAppointmentForm({ assignments, rooms, defaultDate, defaultPatientId, defaultAssignment }: Props) {
  const [state, action] = useActionState(createAppointments, initialState);
  const [patientId, setPatientId] = useState(defaultPatientId ?? "");
  const [recurring, setRecurring] = useState(false);
  const [date, setDate] = useState(defaultDate);
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
        <Select name="assignment" key={patientId} defaultValue={patientId === defaultPatientId ? defaultAssignment : undefined} required disabled={!patientId}>
          {patientAssignments.length !== 1 && <option value="">Selecione...</option>}
          {patientAssignments.map((item) => (
            <option key={`${item.therapistId}:${item.therapyId}`} value={`${item.therapistId}:${item.therapyId}`}>
              {item.therapistName} — {item.therapyName}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="mb-4">
        <legend className="mb-1.5 block text-xs font-semibold text-t2">Frequência</legend>
        <div className="flex flex-wrap gap-4 text-sm text-t1">
          <label className="flex items-center gap-2">
            <input type="radio" name="frequency" value="single" checked={!recurring} onChange={() => setRecurring(false)} />
            Sessão única
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="frequency" value="recurring" checked={recurring} onChange={() => setRecurring(true)} />
            Agenda fixa (toda semana)
          </label>
        </div>
      </fieldset>
      {recurring && (
        <fieldset className="mb-4" data-testid="recurring-weekdays">
          <legend className="mb-1.5 block text-xs font-semibold text-t2">Dias da semana</legend>
          {/* key: re-check the start date's weekday when it changes */}
          <div key={date} className="flex flex-wrap gap-2">
            {SCHEDULABLE_WEEKDAYS.map((day) => (
              <label key={day} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm capitalize text-t1">
                <input type="checkbox" name="weekdays" value={day} defaultChecked={day === weekdayOf(date)} />
                {WEEKDAY_SHORT[day]}
              </label>
            ))}
          </div>
          {state.fieldErrors?.weekdays && <span className="mt-1 block text-[11px] font-medium text-danger">{state.fieldErrors.weekdays.join(" ")}</span>}
        </fieldset>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={recurring ? "Início" : "Data"} name="date" error={state.fieldErrors?.date}>
          <Input name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
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
        {recurring && (
          <Field label="Término (opcional)" name="ends_on" error={state.fieldErrors?.ends_on} hint="Vazio = sem data para acabar">
            <Input name="ends_on" type="date" min={date} />
          </Field>
        )}
      </div>
      {recurring && (
        <p className="mb-4 text-xs text-t3">
          As sessões das próximas 8 semanas são criadas agora e as seguintes, automaticamente. Cada sessão continua podendo ser remarcada ou
          cancelada individualmente.
        </p>
      )}
      <Field label="Observações" name="notes">
        <Textarea name="notes" rows={2} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Agendando...">Agendar</SubmitButton>
      </div>
    </form>
  );
}
