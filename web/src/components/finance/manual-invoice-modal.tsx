"use client";

import { useActionState, useEffect } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  payees: { id: string; name: string; roleLabel: string }[];
  defaultPayee?: string;
};

// Ad hoc invoice request for any active team member (value + description).
export function ManualInvoiceModal(props: Props) {
  return (
    <Modal trigger="+ Solicitar NF avulsa" title="Solicitar nota fiscal avulsa">
      {(close) => <ManualInvoiceForm {...props} onDone={close} />}
    </Modal>
  );
}

function ManualInvoiceForm({ action, payees, defaultPayee, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} data-testid="manual-invoice-form">
      <FormMessage state={state} />
      <Field label="Profissional" name="payee" error={errors.payee}>
        <Select name="payee" required defaultValue={defaultPayee ?? ""}>
          <option value="" disabled>
            Selecione...
          </option>
          {payees.map((payee) => (
            <option key={payee.id} value={payee.id}>
              {payee.name} — {payee.roleLabel}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Valor (R$)" name="amount" error={errors.amount}>
        <Input name="amount" required inputMode="decimal" placeholder="350,00" />
      </Field>
      <Field label="Descrição" name="description" error={errors.description} hint="Aparece para o profissional ao emitir a nota.">
        <Textarea name="description" required rows={3} maxLength={300} placeholder="Ex.: Supervisão clínica — setembro/2026" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Solicitando..." data-testid="manual-invoice-submit">
          Solicitar nota
        </SubmitButton>
      </div>
    </form>
  );
}
