"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { setPassword } from "./actions";
import { PASSWORD_HINT } from "./password-rules";

export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <Field label="Nova senha" name="password" hint={PASSWORD_HINT} error={state.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} data-testid="new-password" />
      </Field>
      <Field label="Confirme a nova senha" name="confirmation" error={state.fieldErrors?.confirmation}>
        <Input name="confirmation" type="password" autoComplete="new-password" required data-testid="confirm-password" />
      </Field>
      <SubmitButton className="mt-2 w-full" pendingLabel="Salvando...">
        Salvar senha e entrar
      </SubmitButton>
    </form>
  );
}
