"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { SubmitButton } from "@/components/ui/form";

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

// One-click row action (mark paid, approve…) posting hidden fields to a server action.
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel = "Aguarde...",
  variant = "ghost",
  confirmMessage,
  testId,
}: {
  action: ServerAction;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "outline" | "ghost" | "danger" | "success";
  confirmMessage?: string;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel} data-testid={testId}>
        {label}
      </SubmitButton>
      {!state.ok && state.message && <span className="max-w-48 text-[11px] font-medium text-danger">{state.message}</span>}
    </form>
  );
}
