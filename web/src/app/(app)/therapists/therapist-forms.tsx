"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, useResetOnSuccess } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { addTherapistRate, createTherapist, updateTherapist } from "./actions";

type Professional = { specialty: string; council_registry: string | null; color: string };

function ProfessionalFields({ state, therapist }: { state: ActionState; therapist?: Professional }) {
  const errors = state.fieldErrors ?? {};
  return (
    <div className="grid gap-x-3 sm:grid-cols-[1fr_1fr_110px]">
      <Field label="Especialidade" name="specialty" error={errors.specialty}>
        <Input name="specialty" required placeholder="Ex.: Psicóloga" defaultValue={therapist?.specialty} />
      </Field>
      <Field label="Registro do conselho" name="council_registry" error={errors.council_registry}>
        <Input name="council_registry" placeholder="Ex.: CRP 06/12345" defaultValue={therapist?.council_registry ?? ""} />
      </Field>
      <Field label="Cor na agenda" name="color" error={errors.color}>
        <Input name="color" type="color" className="h-[38px] p-1" defaultValue={therapist?.color ?? "#2E86DE"} />
      </Field>
    </div>
  );
}

export function NewTherapistButton() {
  const [state, action] = useActionState(createTherapist, initialActionState);
  const errors = state.fieldErrors ?? {};
  return (
    <Modal trigger="+ Novo terapeuta" title="Novo terapeuta" wide>
      <form action={action} noValidate data-testid="new-therapist-form">
        <FormMessage state={state} />
        <Field label="Nome completo" name="full_name" error={errors.full_name}>
          <Input name="full_name" required />
        </Field>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="E-mail (login)" name="email" error={errors.email}>
            <Input name="email" type="email" required />
          </Field>
          <Field label="Telefone" name="phone" error={errors.phone}>
            <Input name="phone" />
          </Field>
        </div>
        <ProfessionalFields state={state} />
        <p className="mb-4 text-xs text-t3">O terapeuta recebe um convite por e-mail para definir a própria senha.</p>
        <SubmitButton pendingLabel="Criando...">Criar terapeuta</SubmitButton>
      </form>
    </Modal>
  );
}

export function EditTherapistForm({ id, therapist }: { id: string; therapist: Professional }) {
  const [state, action] = useActionState(updateTherapist, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <ProfessionalFields state={state} therapist={therapist} />
      <SubmitButton size="sm">Salvar</SubmitButton>
    </form>
  );
}

export function AddRateForm({ therapistId, therapies, today }: { therapistId: string; therapies: { id: string; name: string }[]; today: string }) {
  const [state, action] = useActionState(addTherapistRate, initialActionState);
  const formRef = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};
  return (
    <form ref={formRef} action={action} noValidate data-testid="add-rate-form">
      <FormMessage state={state} />
      <input type="hidden" name="therapist_id" value={therapistId} />
      <div className="grid gap-x-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Terapia" name="therapy_id" error={errors.therapy_id}>
          <Select name="therapy_id" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {therapies.map((therapy) => (
              <option key={therapy.id} value={therapy.id}>
                {therapy.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Modelo" name="pay_model" error={errors.pay_model}>
          <Select name="pay_model" defaultValue="per_session">
            <option value="per_session">Por sessão (valor fixo)</option>
            <option value="per_hour">Por hora (proporcional)</option>
          </Select>
        </Field>
        <Field label="Valor (R$)" name="amount" error={errors.amount}>
          <Input name="amount" inputMode="decimal" placeholder="120,00" required />
        </Field>
        <Field label="Vigente a partir de" name="valid_from" error={errors.valid_from}>
          <Input name="valid_from" type="date" required defaultValue={today} />
        </Field>
      </div>
      <SubmitButton size="sm">Cadastrar valor</SubmitButton>
    </form>
  );
}
