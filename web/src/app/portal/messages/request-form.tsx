"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { createGuardianRequest } from "./actions";
import { REQUEST_TYPE_LABELS } from "./labels";

export function RequestForm({ patients }: { patients: { id: string; full_name: string }[] }) {
  const [state, formAction] = useActionState(createGuardianRequest, initialActionState);
  const formRef = useResetOnSuccess(state);

  return (
    <form ref={formRef} action={formAction} data-testid="guardian-request-form">
      <FormMessage state={state} />
      <Field label="Tipo de solicitação" name="request_type" error={state.fieldErrors?.request_type}>
        <Select name="request_type" defaultValue="information">
          {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {patients.length > 0 && (
        <Field label="Sobre qual criança? (opcional)" name="patient_id" error={state.fieldErrors?.patient_id}>
          <Select name="patient_id" defaultValue="">
            <option value="">—</option>
            {patients.map((child) => (
              <option key={child.id} value={child.id}>
                {child.full_name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Mensagem" name="message" error={state.fieldErrors?.message}>
        <Textarea name="message" required rows={3} maxLength={4000} placeholder="Descreva sua solicitação..." />
      </Field>
      <SubmitButton pendingLabel="Enviando..." className="w-full">
        Enviar solicitação
      </SubmitButton>
    </form>
  );
}
