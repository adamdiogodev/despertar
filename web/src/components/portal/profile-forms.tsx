"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { PASSWORD_RULE_TEXT } from "./rules";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function PhoneForm({ phone, action }: { phone: string | null; action: Action }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" data-testid="phone-form">
      <div className="min-w-48 flex-1">
        <FormMessage state={state} />
        <Field label="Meu telefone" name="phone" error={state.fieldErrors?.phone}>
          <Input name="phone" type="tel" defaultValue={phone ?? ""} placeholder="(11) 98765-4321" maxLength={20} />
        </Field>
      </div>
      <SubmitButton size="sm" variant="outline" className="mb-4">
        Salvar telefone
      </SubmitButton>
    </form>
  );
}

export function DataUpdateForm({
  families,
  childOptions,
  action,
}: {
  families: { id: string; name: string }[];
  childOptions: { id: string; name: string }[];
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} data-testid="data-update-form">
      <FormMessage state={state} />
      {families.length > 1 ? (
        <Field label="Família" name="familyId" error={state.fieldErrors?.familyId}>
          <Select name="familyId" required>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="familyId" value={families[0]?.id ?? ""} />
      )}
      {childOptions.length > 0 && (
        <Field label="Sobre qual criança? (opcional)" name="patientId" error={state.fieldErrors?.patientId}>
          <Select name="patientId" defaultValue="">
            <option value="">Dados da família / responsáveis</option>
            {childOptions.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="O que precisa mudar?" name="message" error={state.fieldErrors?.message}>
        <Textarea name="message" rows={3} required maxLength={4000} placeholder="Ex.: mudamos de endereço para Rua..., novo número da carteirinha do convênio..." />
      </Field>
      <SubmitButton pendingLabel="Enviando...">Solicitar atualização de dados</SubmitButton>
    </form>
  );
}

export function PasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} data-testid="password-form">
      <FormMessage state={state} />
      <Field label="Nova senha" name="password" error={state.fieldErrors?.password} hint={PASSWORD_RULE_TEXT}>
        <Input type="password" name="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirmar nova senha" name="confirmation" error={state.fieldErrors?.confirmation}>
        <Input type="password" name="confirmation" required minLength={10} autoComplete="new-password" />
      </Field>
      <SubmitButton size="sm" pendingLabel="Salvando...">
        Salvar nova senha
      </SubmitButton>
    </form>
  );
}
