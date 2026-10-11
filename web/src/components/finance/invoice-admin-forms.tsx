"use client";

import { useActionState, useEffect } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/components/ui/primitives";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;
type GenerateState = ActionState & { lines?: { text: string; missing: boolean }[] };

export function NewPeriodModal({ action, defaultStart, defaultEnd }: { action: Action; defaultStart: string; defaultEnd: string }) {
  return (
    <Modal trigger="+ Novo período" title="Novo período de fechamento">
      {(close) => <NewPeriodForm action={action} defaultStart={defaultStart} defaultEnd={defaultEnd} onDone={close} />}
    </Modal>
  );
}

function NewPeriodForm({ action, defaultStart, defaultEnd, onDone }: { action: Action; defaultStart: string; defaultEnd: string; onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} data-testid="new-period-form">
      <FormMessage state={state} />
      <Field label="Rótulo" name="label" error={errors.label}>
        <Input name="label" required maxLength={80} placeholder="Ex.: Outubro/2026" />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Início" name="starts_on" error={errors.starts_on}>
          <Input name="starts_on" type="date" required defaultValue={defaultStart} />
        </Field>
        <Field label="Fim" name="ends_on" error={errors.ends_on}>
          <Input name="ends_on" type="date" required defaultValue={defaultEnd} />
        </Field>
      </div>
      <p className="mb-4 text-xs text-t3">Entram no período as sessões concluídas com data entre o início e o fim (inclusive).</p>
      <div className="flex justify-end">
        <SubmitButton data-testid="new-period-submit">Criar período</SubmitButton>
      </div>
    </form>
  );
}

export function GenerateRequestsForm({ action, periodId }: { action: (state: GenerateState, formData: FormData) => Promise<GenerateState>; periodId: string }) {
  const [state, formAction] = useActionState(action, initialActionState as GenerateState);
  return (
    <div>
      <form action={formAction} className="mb-3">
        <input type="hidden" name="period_id" value={periodId} />
        <SubmitButton pendingLabel="Gerando..." data-testid="generate-invoices">
          Gerar solicitações de NF
        </SubmitButton>
      </form>
      <FormMessage state={state} />
      {state.lines && state.lines.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm" data-testid="generate-result">
          {state.lines.map((line) => (
            <li key={line.text} className={cn(line.missing ? "font-semibold text-danger" : "text-t2")}>
              {line.missing ? "⚠ " : "✓ "}
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RejectInvoiceModal({ action, requestId }: { action: Action; requestId: string }) {
  return (
    <Modal trigger="Recusar" triggerVariant="ghost" triggerSize="sm" title="Recusar nota fiscal">
      {(close) => <RejectForm action={action} requestId={requestId} onDone={close} />}
    </Modal>
  );
}

function RejectForm({ action, requestId, onDone }: { action: Action; requestId: string; onDone: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={formAction}>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={requestId} />
      <Field label="Motivo da recusa" name="reason" error={state.fieldErrors?.reason} hint="O profissional verá este motivo e poderá reenviar a nota.">
        <Textarea name="reason" required rows={3} maxLength={500} placeholder="Ex.: valor da NF diverge do solicitado" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" data-testid="reject-invoice-submit">
          Recusar nota
        </SubmitButton>
      </div>
    </form>
  );
}
