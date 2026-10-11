"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { RECORD_STATUSES, STATUS_META, type RecordStatus } from "./patient-helpers";

export type PatientFormValues = {
  id?: string;
  family_id?: string;
  full_name?: string;
  birth_date?: string | null;
  diagnosis?: string | null;
  insurance_name?: string;
  insurance_number?: string | null;
  school?: string | null;
  care_started_on?: string | null;
  status?: RecordStatus;
};

// mode "create" asks for the family; mode "edit" asks for the status instead.
export function PatientForm({
  action,
  mode,
  families = [],
  values = {},
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  mode: "create" | "edit";
  families?: { id: string; name: string }[];
  values?: PatientFormValues;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} data-testid="patient-form">
      <FormMessage state={state} />
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-x-4 sm:grid-cols-2">
        {mode === "create" ? (
          <Field label="Família *" name="family_id" error={errors.family_id}>
            <Select name="family_id" defaultValue={values.family_id ?? ""} required>
              <option value="">— Selecione a família —</option>
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Status" name="status" error={errors.status}>
            <Select name="status" defaultValue={values.status ?? "active"}>
              {RECORD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Nome completo *" name="full_name" error={errors.full_name}>
          <Input name="full_name" defaultValue={values.full_name ?? ""} required />
        </Field>
        <Field label="Data de nascimento" name="birth_date" error={errors.birth_date}>
          <Input type="date" name="birth_date" defaultValue={values.birth_date ?? ""} />
        </Field>
        <Field label="Diagnóstico / CID" name="diagnosis" error={errors.diagnosis}>
          <Input name="diagnosis" defaultValue={values.diagnosis ?? ""} placeholder="ex: TEA · F84.0" />
        </Field>
        <Field label="Convênio" name="insurance_name" error={errors.insurance_name} hint="Deixe em branco para Particular.">
          <Input name="insurance_name" defaultValue={values.insurance_name ?? ""} placeholder="Particular" />
        </Field>
        <Field label="Número da carteirinha" name="insurance_number" error={errors.insurance_number}>
          <Input name="insurance_number" defaultValue={values.insurance_number ?? ""} />
        </Field>
        <Field label="Escola" name="school" error={errors.school}>
          <Input name="school" defaultValue={values.school ?? ""} />
        </Field>
        <Field label="Início do atendimento" name="care_started_on" error={errors.care_started_on}>
          <Input type="date" name="care_started_on" defaultValue={values.care_started_on ?? ""} />
        </Field>
      </div>

      <div className="flex justify-end">
        <SubmitButton data-testid="patient-submit">{mode === "create" ? "Cadastrar paciente" : "Salvar alterações"}</SubmitButton>
      </div>
    </form>
  );
}
