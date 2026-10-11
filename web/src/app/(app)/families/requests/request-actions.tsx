"use client";

import { useActionState, useTransition } from "react";
import { initialActionState } from "@/lib/action-state";
import { Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { answerRequest, closeRequest } from "./actions";

export function RequestActions({ id, canAnswer, currentResponse }: { id: string; canAnswer: boolean; currentResponse: string | null }) {
  const [state, action] = useActionState(answerRequest, initialActionState);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {canAnswer && (
        <Modal trigger={currentResponse ? "Editar resposta" : "Responder"} title="Responder solicitação" triggerSize="sm">
          <form action={action} noValidate data-testid="answer-request-form">
            <FormMessage state={state} />
            <input type="hidden" name="id" value={id} />
            <Field label="Resposta para a família" name="response" error={state.fieldErrors?.response}>
              <Textarea name="response" rows={5} required defaultValue={currentResponse ?? ""} />
            </Field>
            <p className="mb-4 text-xs text-t3">A família é notificada no portal assim que a resposta é enviada.</p>
            <SubmitButton pendingLabel="Enviando...">Enviar resposta</SubmitButton>
          </form>
        </Modal>
      )}
      {canAnswer && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => void (await closeRequest(id)))}>
          Encerrar
        </Button>
      )}
    </div>
  );
}
