"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";

export function LoginForm() {
  const [state, action] = useActionState(signIn, initialActionState);
  return (
    <form action={action} noValidate>
      <FormMessage state={state} />
      <Field label="E-mail" name="email">
        <Input name="email" type="email" autoComplete="email" required placeholder="seu@email.com" />
      </Field>
      <Field label="Senha" name="password">
        <Input name="password" type="password" autoComplete="current-password" required placeholder="Sua senha" />
      </Field>
      <SubmitButton className="mt-2 w-full" pendingLabel="Entrando...">
        Entrar no Sistema
      </SubmitButton>
    </form>
  );
}
