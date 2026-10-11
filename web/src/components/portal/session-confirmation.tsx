"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Modal } from "@/components/ui/modal";
import { Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function SessionConfirmation({ appointmentId, label, action }: { appointmentId: string; label: string; action: Action }) {
  const [state, formAction] = useActionState(action, initialActionState);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="session-confirmation">
      <form action={formAction}>
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="answer" value="confirm" />
        <SubmitButton variant="success" size="sm" pendingLabel="Enviando..." data-testid="session-confirm">
          👍 De acordo, a sessão foi realizada
        </SubmitButton>
      </form>
      <Modal trigger="Contestar" title="Contestar sessão" triggerVariant="ghost" triggerSize="sm">
        {(close) => <DisputeForm appointmentId={appointmentId} label={label} action={action} onDone={close} />}
      </Modal>
      {!state.ok && state.message && <p className="w-full text-xs font-medium text-danger">{state.message}</p>}
    </div>
  );
}

function DisputeForm({ appointmentId, label, action, onDone }: { appointmentId: string; label: string; action: Action; onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  if (state.ok) {
    return (
      <div className="text-center">
        <div className="mb-3 text-4xl">📨</div>
        <p className="text-sm text-t1">{state.message}</p>
        <Button type="button" className="mt-5" onClick={onDone}>
          Fechar
        </Button>
      </div>
    );
  }
  return (
    <form action={formAction} data-testid="dispute-form">
      <p className="mb-4 text-sm text-t2">
        Sessão de <strong className="text-t1">{label}</strong>. Conte o que aconteceu — a clínica e o terapeuta serão avisados.
      </p>
      <FormMessage state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="answer" value="dispute" />
      <Field label="Motivo *" name="note" error={state.fieldErrors?.note}>
        <Textarea name="note" rows={3} required minLength={3} maxLength={1000} placeholder="Ex.: não comparecemos neste dia" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Enviando...">
          Enviar contestação
        </SubmitButton>
      </div>
    </form>
  );
}
