"use client";

import { FileInput } from "@/components/ui/file-input";
import { useActionState, useEffect, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { REPORT_TYPE_LABELS } from "./report-utils";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type PatientOption = { id: string; name: string; therapists: { id: string; name: string }[] };

// Closes the modal once the action succeeds.
function useCloseOnSuccess(state: ActionState, close: () => void) {
  useEffect(() => {
    if (state.ok) close();
  }, [state, close]);
}

function CreateReportForm({
  action,
  patients,
  chooseTherapist,
  defaultPatientId,
  close,
}: {
  action: Action;
  patients: PatientOption[];
  chooseTherapist: boolean;
  defaultPatientId?: string;
  close: () => void;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [patientId, setPatientId] = useState(defaultPatientId ?? "");
  const therapists = patients.find((p) => p.id === patientId)?.therapists ?? [];
  useCloseOnSuccess(state, close);

  return (
    <form action={formAction} data-testid="report-create-form">
      <FormMessage state={state} />
      <Field label="Paciente" name="patientId" error={state.fieldErrors?.patientId}>
        <Select name="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
          <option value="">— Selecionar —</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {chooseTherapist && (
        <Field label="Terapeuta" name="therapistId" error={state.fieldErrors?.therapistId} hint="Somente terapeutas com vínculo vigente com o paciente.">
          <Select name="therapistId" required disabled={!patientId} key={patientId}>
            <option value="">— Selecionar —</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Tipo" name="reportType" error={state.fieldErrors?.reportType}>
        <Select name="reportType" required defaultValue="">
          <option value="">— Selecionar —</option>
          {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Referência" name="referenceLabel" error={state.fieldErrors?.referenceLabel}>
        <Input name="referenceLabel" placeholder="Ex.: 2º Sem. 2026" required maxLength={80} />
      </Field>
      <Field label="Prazo" name="dueDate" error={state.fieldErrors?.dueDate}>
        <Input name="dueDate" type="date" />
      </Field>
      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel="Salvando...">{chooseTherapist ? "Solicitar" : "Criar relatório"}</SubmitButton>
      </div>
    </form>
  );
}

export function CreateReportModal({
  action,
  patients,
  chooseTherapist,
  defaultPatientId,
}: {
  action: Action;
  patients: PatientOption[];
  chooseTherapist: boolean;
  defaultPatientId?: string;
}) {
  const label = chooseTherapist ? "Solicitar relatório" : "Novo relatório";
  return (
    <Modal trigger={`+ ${label}`} title={label} triggerSize="sm">
      {(close) => <CreateReportForm action={action} patients={patients} chooseTherapist={chooseTherapist} defaultPatientId={defaultPatientId} close={close} />}
    </Modal>
  );
}

// Patient page: create + attach + send to review in one step.
function UploadReportForm({ action, patient, chooseTherapist, accept, close }: { action: Action; patient: PatientOption; chooseTherapist: boolean; accept: string; close: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useCloseOnSuccess(state, close);
  return (
    <form action={formAction} data-testid="report-upload-form">
      <FormMessage state={state} />
      <input type="hidden" name="patientId" value={patient.id} />
      {chooseTherapist && (
        <Field label="Terapeuta responsável" name="therapistId" error={state.fieldErrors?.therapistId} hint="Somente terapeutas com vínculo vigente.">
          <Select name="therapistId" required defaultValue={patient.therapists.length === 1 ? patient.therapists[0].id : ""}>
            <option value="">— Selecionar —</option>
            {patient.therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Tipo" name="reportType" error={state.fieldErrors?.reportType}>
        <Select name="reportType" required defaultValue="">
          <option value="">— Selecionar —</option>
          {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Referência" name="referenceLabel" error={state.fieldErrors?.referenceLabel}>
        <Input name="referenceLabel" placeholder="Ex.: 2º Sem. 2026" required maxLength={80} />
      </Field>
      <Field label="Arquivo do relatório" name="file" error={state.fieldErrors?.file} hint="PDF, Word ou imagem — até 20 MB. Vai para revisão da coordenação ou da administração.">
        <FileInput name="file" accept={accept} required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando...">Enviar para revisão</SubmitButton>
      </div>
    </form>
  );
}

export function UploadReportModal(props: { action: Action; patient: PatientOption; chooseTherapist: boolean; accept: string }) {
  return (
    <Modal trigger="📤 Incluir relatório" title={`Incluir relatório — ${props.patient.name}`} triggerSize="sm" triggerVariant="outline">
      {(close) => <UploadReportForm {...props} close={close} />}
    </Modal>
  );
}

function SubmitReportForm({ action, reportId, accept, close }: { action: Action; reportId: string; accept: string; close: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useCloseOnSuccess(state, close);
  return (
    <form action={formAction}>
      <FormMessage state={state} />
      <input type="hidden" name="reportId" value={reportId} />
      <Field label="Arquivo do relatório" name="file" error={state.fieldErrors?.file} hint="PDF, Word ou imagem — até 20 MB.">
        <FileInput name="file" accept={accept} required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando...">Enviar para revisão</SubmitButton>
      </div>
    </form>
  );
}

export function SubmitReportModal({ action, reportId, patientName, accept }: { action: Action; reportId: string; patientName: string; accept: string }) {
  return (
    <Modal trigger="📤 Enviar" title={`Enviar relatório — ${patientName}`} triggerSize="sm">
      {(close) => <SubmitReportForm action={action} reportId={reportId} accept={accept} close={close} />}
    </Modal>
  );
}

function ReturnReportForm({ action, reportId, close }: { action: Action; reportId: string; close: () => void }) {
  const [state, formAction] = useActionState(action, initialActionState);
  useCloseOnSuccess(state, close);
  return (
    <form action={formAction}>
      <FormMessage state={state} />
      <input type="hidden" name="reportId" value={reportId} />
      <Field label="Motivo da devolução" name="reason" error={state.fieldErrors?.reason}>
        <Textarea name="reason" rows={4} required minLength={5} maxLength={1000} placeholder="O que precisa ser corrigido?" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="danger" pendingLabel="Devolvendo...">
          Devolver
        </SubmitButton>
      </div>
    </form>
  );
}

export function ReturnReportModal({ action, reportId, patientName }: { action: Action; reportId: string; patientName: string }) {
  return (
    <Modal trigger="↩ Devolver" title={`Devolver relatório — ${patientName}`} triggerVariant="danger" triggerSize="sm">
      {(close) => <ReturnReportForm action={action} reportId={reportId} close={close} />}
    </Modal>
  );
}
