"use client";

import { useActionState, useEffect } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, useResetOnSuccess } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PAYMENT_METHODS } from "./logic";

type Props = {
  families: { id: string; name: string }[];
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaultDueDate: string;
};

export function NewChargeModal(props: Props) {
  return (
    <Modal trigger="+ Nova cobrança" title="Nova cobrança">
      {(close) => <NewChargeForm {...props} onDone={close} />}
    </Modal>
  );
}

function NewChargeForm({ families, action, defaultDueDate, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const formRef = useResetOnSuccess(state);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={formAction} data-testid="new-charge-form">
      <FormMessage state={state} />
      <Field label="Família" name="family_id" error={errors.family_id}>
        <Select name="family_id" required defaultValue="">
          <option value="" disabled>
            Selecione...
          </option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Referência" name="reference" error={errors.reference}>
        <Input name="reference" required placeholder="Ex.: Outubro/2026 — Sessões" maxLength={120} />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Valor (R$)" name="amount" error={errors.amount}>
          <Input name="amount" required inputMode="decimal" placeholder="480,00" />
        </Field>
        <Field label="Vencimento" name="due_date" error={errors.due_date}>
          <Input name="due_date" type="date" required defaultValue={defaultDueDate} />
        </Field>
        <Field label="Forma de pagamento" name="payment_method" error={errors.payment_method}>
          <Select name="payment_method" defaultValue="Pix">
            {PAYMENT_METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status inicial" name="status" error={errors.status}>
          <Select name="status" defaultValue="pending">
            <option value="pending">Pendente</option>
            <option value="awaiting_insurance">Aguardando convênio</option>
            <option value="paid">Pago</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton data-testid="new-charge-submit">Criar cobrança</SubmitButton>
      </div>
    </form>
  );
}
