"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { createAnnouncement } from "./actions";

export function AnnouncementForm() {
  const [state, formAction] = useActionState(createAnnouncement, initialActionState);
  const formRef = useResetOnSuccess(state);

  return (
    <Modal trigger="📢 Novo comunicado" title="Novo comunicado">
      <form ref={formRef} action={formAction}>
        <FormMessage state={state} />
        <Field label="Título" name="title" error={state.fieldErrors?.title}>
          <Input name="title" required maxLength={160} />
        </Field>
        <Field label="Mensagem" name="body" error={state.fieldErrors?.body}>
          <Textarea name="body" required rows={5} maxLength={4000} />
        </Field>
        <Field label="Público" name="audience" error={state.fieldErrors?.audience}>
          <Select name="audience" defaultValue="all">
            <option value="all">Todos (equipe e famílias)</option>
            <option value="staff">Somente equipe</option>
            <option value="guardians">Somente famílias</option>
          </Select>
        </Field>
        <SubmitButton pendingLabel="Publicando..." className="w-full">
          Publicar
        </SubmitButton>
      </form>
    </Modal>
  );
}
