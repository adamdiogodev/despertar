"use client";

import { FileInput } from "@/components/ui/file-input";
import { useActionState, useEffect, type ReactNode } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { RECEIPT_ACCEPT } from "./logic";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  trigger: string;
  title: string;
  submitLabel: string;
  description?: ReactNode;
  // Paying a payout may happen before the receipt exists; attaching always needs the file.
  fileRequired?: boolean;
  triggerVariant?: "primary" | "outline" | "ghost" | "success";
  testId?: string;
};

// Upload a payment receipt (family charge or payout) and post it to a server action.
export function ReceiptModal(props: Props) {
  return (
    <Modal trigger={props.trigger} triggerVariant={props.triggerVariant ?? "ghost"} triggerSize="sm" title={props.title}>
      {(close) => <ReceiptForm {...props} onDone={close} />}
    </Modal>
  );
}

function ReceiptForm({ action, fields, submitLabel, description, fileRequired = true, testId, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction} data-testid={testId}>
      <FormMessage state={state} />
      {description && <div className="mb-4 text-sm text-t2">{description}</div>}
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field
        label={fileRequired ? "Comprovante (PDF ou imagem, até 20 MB)" : "Comprovante (opcional — pode anexar depois)"}
        name="file"
        error={state.fieldErrors?.file}
      >
        <FileInput name="file" required={fileRequired} accept={RECEIPT_ACCEPT} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando..." data-testid={testId ? `${testId}-submit` : undefined}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
