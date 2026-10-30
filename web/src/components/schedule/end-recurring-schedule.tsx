"use client";

import { useActionState, useEffect } from "react";
import { initialActionState } from "@/lib/action-state";
import { endRecurringSchedule } from "@/app/(app)/schedule/actions";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

export function EndRecurringSchedule({ id, label, today }: { id: string; label: string; today: string }) {
  return (
    <Modal trigger="Encerrar" title="Encerrar agenda fixa" triggerVariant="outline" triggerSize="sm">
      {(close) => <EndRecurringScheduleForm id={id} label={label} today={today} onDone={close} />}
    </Modal>
  );
}

function EndRecurringScheduleForm({ id, label, today, onDone }: { id: string; label: string; today: string; onDone: () => void }) {
  const [state, action] = useActionState(endRecurringSchedule, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} data-testid="end-recurring-schedule-form">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <p className="mb-4 text-sm text-t2">
        <strong className="text-t1">{label}</strong>. As sessões depois da última data são removidas da agenda; as anteriores continuam. A família e o
        terapeuta são avisados.
      </p>
      <Field label="Última data *" name="ends_on" error={state.fieldErrors?.ends_on}>
        <Input name="ends_on" type="date" min={today} defaultValue={today} required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Encerrando...">
          Encerrar agenda fixa
        </SubmitButton>
      </div>
    </form>
  );
}
