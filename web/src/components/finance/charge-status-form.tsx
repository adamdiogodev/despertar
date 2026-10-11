"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { SubmitButton } from "@/components/ui/form";
import { CHARGE_STATUS_OPTIONS, type ChargeStatus } from "./logic";

// Inline status change for a family charge (pending / paid / awaiting insurance / canceled).
export function ChargeStatusForm({
  action,
  chargeId,
  status,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  chargeId: string;
  status: ChargeStatus;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="inline-flex max-w-full flex-col gap-1" data-testid="charge-status-form">
      <input type="hidden" name="id" value={chargeId} />
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          name="status"
          defaultValue={status}
          aria-label="Status da cobrança"
          className="rounded-lg border-[1.5px] border-line bg-white px-2 py-1 text-xs text-t1"
        >
          {CHARGE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SubmitButton variant="ghost" size="sm" pendingLabel="..." data-testid="charge-status-submit">
          Salvar
        </SubmitButton>
      </div>
      {state.message && <span className={state.ok ? "text-[11px] font-medium text-ok" : "max-w-48 text-[11px] font-medium text-danger"}>{state.message}</span>}
    </form>
  );
}
