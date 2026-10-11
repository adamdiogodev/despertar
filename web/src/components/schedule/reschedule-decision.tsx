"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { initialActionState } from "@/lib/action-state";
import { decideReschedule } from "@/app/(app)/schedule/actions";

export function RescheduleDecision({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(decideReschedule, initialActionState);
  return (
    <form action={action} className="mt-3" data-testid="reschedule-decision">
      <FormMessage state={state} />
      <input type="hidden" name="request_id" value={requestId} />
      <Textarea name="note" rows={2} placeholder="Observação para quem solicitou (opcional)" aria-label="Observação" />
      <div className="mt-2 flex justify-end gap-2">
        <SubmitButton name="decision" value="reject" variant="ghost" size="sm" pendingLabel="...">
          Recusar
        </SubmitButton>
        <SubmitButton name="decision" value="approve" variant="success" size="sm" pendingLabel="...">
          Aprovar
        </SubmitButton>
      </div>
    </form>
  );
}
