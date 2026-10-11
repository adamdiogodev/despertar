"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Badge, InfoRow, LinkButton, buttonClass } from "@/components/ui/primitives";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { durationMinutes, formatDate, formatTime, localDateKey } from "@/lib/format";
import { localTimeKey } from "@/lib/schedule";
import {
  cancelAppointment,
  completeAppointment,
  setAppointmentStatus,
  updateAppointment,
} from "@/app/(app)/schedule/actions";
import { familyConfirmationMeta } from "@/components/patients/session-record-utils";
import { OPEN_STATUSES, STATUS_META, type Option, type ScheduleAppointment, type ScheduleViewer } from "./types";

type Mode = "view" | "edit" | "complete" | "cancel";

export function AppointmentDetail({
  appointment,
  viewer,
  rooms,
  onClose,
}: {
  appointment: ScheduleAppointment | null;
  viewer: ScheduleViewer;
  rooms: Option[];
  onClose: () => void;
}) {
  return (
    <Modal title="Detalhes da sessão" open={appointment !== null} onOpenChange={(open) => !open && onClose()}>
      {appointment && <DetailBody key={appointment.id} appointment={appointment} viewer={viewer} rooms={rooms} />}
    </Modal>
  );
}

// Row button used outside the weekly grid (e.g. the patient's agenda tab).
export function AppointmentDetailButton({ appointment, viewer, rooms }: { appointment: ScheduleAppointment; viewer: ScheduleViewer; rooms: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)} data-testid="appointment-detail-open">
        Detalhes
      </button>
      <AppointmentDetail appointment={open ? appointment : null} viewer={viewer} rooms={rooms} onClose={() => setOpen(false)} />
    </>
  );
}

function DetailBody({ appointment, viewer, rooms }: { appointment: ScheduleAppointment; viewer: ScheduleViewer; rooms: Option[] }) {
  const [mode, setMode] = useState<Mode>("view");
  const isOwnSession = appointment.therapistId === viewer.userId;
  const canAct = viewer.isStaff || isOwnSession;
  const isOpen = OPEN_STATUSES.includes(appointment.status);
  const minutes = durationMinutes(appointment.startsAt, appointment.endsAt);
  const back = () => setMode("view");
  const confirmation = familyConfirmationMeta(appointment.status, appointment.familyConfirmation, appointment.familyConfirmationNote);

  return (
    <div data-testid="appointment-detail">
      <InfoRow label="Paciente">
        <Link href={`/patients/${appointment.patientId}`} className="text-primary hover:underline">
          {appointment.patientName}
        </Link>
      </InfoRow>
      <InfoRow label="Terapeuta">{appointment.therapistName}</InfoRow>
      <InfoRow label="Terapia">{appointment.therapyName}</InfoRow>
      <InfoRow label="Sala">{appointment.roomName ?? "—"}</InfoRow>
      <InfoRow label="Data">{formatDate(appointment.startsAt)}</InfoRow>
      <InfoRow label="Horário">
        {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
      </InfoRow>
      <InfoRow label="Duração">{minutes} min</InfoRow>
      <InfoRow label="Status">
        <Badge tone={STATUS_META[appointment.status].tone}>{STATUS_META[appointment.status].label}</Badge>
      </InfoRow>
      {appointment.cancelReason && appointment.status === "canceled" && <InfoRow label="Motivo do cancelamento">{appointment.cancelReason}</InfoRow>}
      {confirmation && (
        <InfoRow label="Família">
          <Badge tone={confirmation.tone}>{confirmation.label}</Badge>
        </InfoRow>
      )}
      <InfoRow label="Observações">{appointment.notes || "—"}</InfoRow>

      <div className="mt-5">
        {mode === "view" && (
          <div className="flex flex-wrap gap-2">
            {canAct && appointment.status === "scheduled" && <StatusButton id={appointment.id} status="confirmed" label="Confirmar" variant="success" />}
            {canAct && isOpen && (
              <button type="button" className={buttonClass("primary", "sm")} onClick={() => setMode("complete")}>
                Concluir
              </button>
            )}
            {canAct && isOpen && <StatusButton id={appointment.id} status="no_show" label="Marcar falta" variant="ghost" />}
            {viewer.isStaff && isOpen && (
              <button type="button" className={buttonClass("outline", "sm")} onClick={() => setMode("edit")}>
                Editar
              </button>
            )}
            {viewer.isStaff && isOpen && (
              <button type="button" className={buttonClass("danger", "sm")} onClick={() => setMode("cancel")}>
                Cancelar sessão
              </button>
            )}
            <LinkButton href={`/patients/${appointment.patientId}?tab=sessions#session-${appointment.id}`} variant="outline" size="sm">
              Ver/registrar sessão
            </LinkButton>
          </div>
        )}
        {mode === "complete" && <CompleteForm id={appointment.id} defaultMinutes={minutes} onBack={back} />}
        {mode === "cancel" && <CancelForm id={appointment.id} onBack={back} />}
        {mode === "edit" && <EditForm appointment={appointment} rooms={rooms} minutes={minutes} onBack={back} />}
      </div>
    </div>
  );
}

// Returns to the summary once the action succeeds; the parent re-renders with fresh data.
function useBackOnSuccess(state: ActionState, onBack: () => void) {
  useEffect(() => {
    if (state.ok) onBack();
  }, [state, onBack]);
}

function StatusButton({
  id,
  status,
  label,
  variant,
}: {
  id: string;
  status: "confirmed" | "no_show";
  label: string;
  variant: "success" | "ghost";
}) {
  const [state, action] = useActionState(setAppointmentStatus, initialActionState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} size="sm" pendingLabel="...">
        {label}
      </SubmitButton>
      {!state.ok && state.message && <p className="mt-1 text-[11px] font-medium text-danger">{state.message}</p>}
    </form>
  );
}

function CompleteForm({ id, defaultMinutes, onBack }: { id: string; defaultMinutes: number; onBack: () => void }) {
  const [state, action] = useActionState(completeAppointment, initialActionState);
  useBackOnSuccess(state, onBack);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Duração real (minutos)" name="minutes" error={state.fieldErrors?.minutes} hint="Base do cálculo por hora da nota fiscal.">
        <Input name="minutes" type="number" min={10} max={480} defaultValue={defaultMinutes} required />
      </Field>
      <FormActions onBack={onBack} submitLabel="Concluir sessão" />
    </form>
  );
}

function CancelForm({ id, onBack }: { id: string; onBack: () => void }) {
  const [state, action] = useActionState(cancelAppointment, initialActionState);
  useBackOnSuccess(state, onBack);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field label="Motivo do cancelamento" name="cancel_reason" error={state.fieldErrors?.cancel_reason}>
        <Textarea name="cancel_reason" rows={3} required minLength={3} />
      </Field>
      <FormActions onBack={onBack} submitLabel="Confirmar cancelamento" variant="danger" />
    </form>
  );
}

function EditForm({
  appointment,
  rooms,
  minutes,
  onBack,
}: {
  appointment: ScheduleAppointment;
  rooms: Option[];
  minutes: number;
  onBack: () => void;
}) {
  const [state, action] = useActionState(updateAppointment, initialActionState);
  useBackOnSuccess(state, onBack);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={appointment.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data" name="date" error={state.fieldErrors?.date}>
          <Input name="date" type="date" defaultValue={localDateKey(appointment.startsAt)} required />
        </Field>
        <Field label="Hora" name="time" error={state.fieldErrors?.time}>
          <Input name="time" type="time" defaultValue={localTimeKey(appointment.startsAt)} required />
        </Field>
        <Field label="Duração (min)" name="duration" error={state.fieldErrors?.duration}>
          <Input name="duration" type="number" min={10} max={480} defaultValue={minutes} required />
        </Field>
        <Field label="Sala" name="room_id">
          <Select name="room_id" defaultValue={appointment.roomId ?? ""}>
            <option value="">Sem sala</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Observações" name="notes">
        <Textarea name="notes" rows={2} defaultValue={appointment.notes ?? ""} />
      </Field>
      <FormActions onBack={onBack} submitLabel="Salvar alterações" />
    </form>
  );
}

function FormActions({ onBack, submitLabel, variant = "primary" }: { onBack: () => void; submitLabel: string; variant?: "primary" | "danger" }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={buttonClass("ghost", "sm")} onClick={onBack}>
        Voltar
      </button>
      <SubmitButton size="sm" variant={variant}>
        {submitLabel}
      </SubmitButton>
    </div>
  );
}
