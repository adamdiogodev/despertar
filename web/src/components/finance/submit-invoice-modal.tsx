"use client";

import { FileInput } from "@/components/ui/file-input";
import { useActionState, useEffect } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  requestId: string;
  amountLabel: string;
  resubmit: boolean;
};

export function SubmitInvoiceModal(props: Props) {
  return (
    <Modal
      trigger={props.resubmit ? "Reenviar NF" : "Enviar NF"}
      triggerVariant={props.resubmit ? "outline" : "primary"}
      triggerSize="sm"
      title={props.resubmit ? "Reenviar nota fiscal" : "Enviar nota fiscal"}
    >
      {(close) => <SubmitInvoiceForm {...props} onDone={close} />}
    </Modal>
  );
}

function SubmitInvoiceForm({ action, requestId, amountLabel, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} data-testid="submit-invoice-form">
      <FormMessage state={state} />
      <p className="mb-4 text-sm text-t2">
        Emita a NF no valor de <strong className="text-t1">{amountLabel}</strong> e anexe o arquivo abaixo.
      </p>
      <input type="hidden" name="id" value={requestId} />
      <Field label="Número da NF" name="number" error={errors.number}>
        <Input name="number" required maxLength={40} placeholder="Ex.: 2026/000123" />
      </Field>
      <Field label="Arquivo (PDF ou XML, até 20 MB)" name="file" error={errors.file}>
        <FileInput name="file" required accept=".pdf,.xml,application/pdf,application/xml,text/xml" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando..." data-testid="submit-invoice-submit">
          Enviar para conferência
        </SubmitButton>
      </div>
    </form>
  );
}
