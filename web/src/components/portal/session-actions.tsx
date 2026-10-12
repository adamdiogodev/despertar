"use client";

import { useActionState, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Modal } from "@/components/ui/modal";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { ClinicContact } from "./child-switcher";
import { canRequestChange } from "./rules";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Props = {
  appointmentId: string;
  startsAt: string;
  label: string;
  minHours: number;
  hasPendingRequest: boolean;
  clinicPhone: string | null;
  clinicWhatsapp: string | null;
  rescheduleAction: Action;
  cancelAction: Action;
};

export function SessionActions(props: Props) {
  const [mode, setMode] = useState<"reschedule" | "cancel" | null>(null);
  // Evaluated when the guardian clicks, so a page left open does not show a stale form.
  const [allowed, setAllowed] = useState(true);
  const open = (next: "reschedule" | "cancel") => {
    setAllowed(canRequestChange(new Date(), props.startsAt, props.minHours));
    setMode(next);
  };

  const title = !allowed ? "Prazo expirado" : mode === "cancel" ? "Cancelar sessão" : "Solicitar remarcação";

  return (
    <div className="flex flex-wrap gap-2">
      {/* While a reschedule request waits for the clinic, the session can't be changed again. */}
      {!props.hasPendingRequest && (
        <>
          <Button size="sm" variant="outline" type="button" onClick={() => open("reschedule")} data-testid="reschedule-open">
            Remarcar
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => open("cancel")} data-testid="cancel-open">
            Cancelar
          </Button>
        </>
      )}
      <Modal title={title} open={mode !== null} onOpenChange={(value) => !value && setMode(null)}>
        {(close) =>
          !allowed ? (
            <div className="text-center" data-testid="change-window-expired">
              <div className="mb-3 text-4xl">⏰</div>
              <p className="text-sm text-t1">
                Alterações precisam ser feitas com pelo menos <strong>{props.minHours} horas</strong> de antecedência, e esta sessão já está
                dentro desse prazo.
              </p>
              <p className="mt-3 text-sm text-t2">Entre em contato com a clínica que a gente ajuda você:</p>
              <div className="mt-2 flex justify-center text-sm">
                <ClinicContact phone={props.clinicPhone} whatsapp={props.clinicWhatsapp} />
              </div>
              <Button type="button" variant="ghost" className="mt-5" onClick={close}>
                Entendi
              </Button>
            </div>
          ) : mode === "cancel" ? (
            <CancelForm {...props} onDone={close} />
          ) : (
            <RescheduleForm {...props} onDone={close} />
          )
        }
      </Modal>
    </div>
  );
}

function RescheduleForm({ appointmentId, label, rescheduleAction, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(rescheduleAction, initialActionState);
  if (state.ok) return <Done message={state.message} onDone={onDone} />;
  return (
    <form action={formAction} data-testid="reschedule-form">
      <p className="mb-4 text-sm text-t2">
        Sessão atual: <strong className="text-t1">{label}</strong>. Sugira uma nova data e a clínica confirma com você.
      </p>
      <FormMessage state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Nova data" name="date" error={state.fieldErrors?.date}>
          <Input type="date" name="date" required />
        </Field>
        <Field label="Horário" name="time" error={state.fieldErrors?.time}>
          <Input type="time" name="time" required step={900} />
        </Field>
      </div>
      <Field label="Motivo" name="reason" error={state.fieldErrors?.reason}>
        <Textarea name="reason" rows={3} required placeholder="Ex.: consulta médica no mesmo horário" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando...">Enviar solicitação</SubmitButton>
      </div>
    </form>
  );
}

function CancelForm({ appointmentId, label, cancelAction, onDone }: Props & { onDone: () => void }) {
  const [state, formAction] = useActionState(cancelAction, initialActionState);
  if (state.ok) return <Done message={state.message} onDone={onDone} />;
  return (
    <form action={formAction} data-testid="cancel-form">
      <p className="mb-4 text-sm text-t2">
        Você está cancelando a sessão de <strong className="text-t1">{label}</strong>. Se preferir outro horário, use &quot;Remarcar&quot;.
      </p>
      <FormMessage state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <Field label="Motivo do cancelamento" name="reason" error={state.fieldErrors?.reason}>
        <Textarea name="reason" rows={3} required placeholder="Ex.: a criança está doente" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Cancelando...">
          Confirmar cancelamento
        </SubmitButton>
      </div>
    </form>
  );
}

function Done({ message, onDone }: { message?: string; onDone: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-3 text-4xl">✅</div>
      <p className="text-sm text-t1">{message}</p>
      <Button type="button" className="mt-5" onClick={onDone}>
        Fechar
      </Button>
    </div>
  );
}
