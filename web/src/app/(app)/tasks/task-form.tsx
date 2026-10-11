"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { createTask } from "./actions";

type Option = { id: string; full_name: string };

export function TaskForm({ assignees, patients, roleLabels }: { assignees: (Option & { role: string })[]; patients: Option[]; roleLabels: Record<string, string> }) {
  const [state, formAction] = useActionState(createTask, initialActionState);
  const formRef = useResetOnSuccess(state);

  return (
    <Modal trigger="+ Nova tarefa" title="Nova tarefa">
      <form ref={formRef} action={formAction} data-testid="task-form">
        <FormMessage state={state} />
        <Field label="Título" name="title" error={state.fieldErrors?.title}>
          <Input name="title" required maxLength={200} />
        </Field>
        <Field label="Descrição (opcional)" name="description" error={state.fieldErrors?.description}>
          <Textarea name="description" rows={3} maxLength={4000} />
        </Field>
        <Field label="Responsável" name="assigned_to" error={state.fieldErrors?.assigned_to}>
          <Select name="assigned_to" required defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name} — {roleLabels[person.role]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Prioridade" name="priority" error={state.fieldErrors?.priority}>
            <Select name="priority" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="urgent">Urgente</option>
            </Select>
          </Field>
          <Field label="Prazo (opcional)" name="due_date" error={state.fieldErrors?.due_date}>
            <Input type="date" name="due_date" />
          </Field>
        </div>
        <Field label="Paciente (opcional)" name="patient_id" error={state.fieldErrors?.patient_id}>
          <Select name="patient_id" defaultValue="">
            <option value="">—</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pendingLabel="Criando..." className="w-full">
          Criar tarefa
        </SubmitButton>
      </form>
    </Modal>
  );
}
