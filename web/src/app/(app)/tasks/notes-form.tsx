"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { savePersonalNotes } from "./actions";

export function NotesForm({ content }: { content: string }) {
  const [state, formAction] = useActionState(savePersonalNotes, initialActionState);

  return (
    <form action={formAction} data-testid="personal-notes-form">
      <FormMessage state={state} />
      <textarea
        name="content"
        defaultValue={content}
        rows={12}
        maxLength={20000}
        aria-label="Minhas notas pessoais"
        placeholder={"Suas anotações pessoais ficam aqui. Não são compartilhadas com a equipe.\n\nEx.: lembrar de trazer materiais para a sessão de quinta."}
        className="w-full resize-y border-0 p-0 text-sm leading-relaxed text-t1 outline-none"
      />
      <SubmitButton size="sm" pendingLabel="Salvando..." className="mt-3">
        💾 Salvar notas
      </SubmitButton>
    </form>
  );
}
