"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { SubmitButton } from "@/components/ui/form";

type Variant = "primary" | "outline" | "ghost" | "danger" | "success";

// One-click form posting hidden fields to a server action, with optional confirm().
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel = "Aguarde...",
  variant = "ghost",
  confirmMessage,
  testId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: Variant;
  confirmMessage?: string;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col"
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton size="sm" variant={variant} pendingLabel={pendingLabel} data-testid={testId}>
        {label}
      </SubmitButton>
      {!state.ok && state.message && <span className="mt-1 max-w-48 text-[11px] text-danger">{state.message}</span>}
    </form>
  );
}
