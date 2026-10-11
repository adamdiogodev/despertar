"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <Field label="E-mail" name="email" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" required placeholder="seu@email.com" data-testid="forgot-email" />
      </Field>
      <SubmitButton className="mt-2 w-full" pendingLabel="Enviando...">
        Enviar link
      </SubmitButton>
    </form>
  );
}
