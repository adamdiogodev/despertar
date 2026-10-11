"use client";

import { FileInput } from "@/components/ui/file-input";
import { useActionState, useEffect } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { DOCUMENT_CATEGORY_LABELS } from "./document-utils";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; name: string };

function UploadForm({
  action,
  families,
  patients,
  allowInternal,
  accept,
  defaultTarget,
  close,
}: {
  action: Action;
  families: Option[];
  patients: Option[];
  allowInternal: boolean;
  accept: string;
  defaultTarget?: string;
  close: () => void;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok) close();
  }, [state, close]);

  return (
    <form action={formAction} data-testid="document-upload-form">
      <FormMessage state={state} />
      <Field label="Título" name="title" error={state.fieldErrors?.title}>
        <Input name="title" required maxLength={160} placeholder="Ex.: Contrato 2026 — Família Silva" />
      </Field>
      <Field label="Categoria" name="category" error={state.fieldErrors?.category}>
        <Select name="category" required defaultValue="">
          <option value="">— Selecionar —</option>
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Família ou paciente" name="target" error={state.fieldErrors?.target}>
        <Select name="target" defaultValue={defaultTarget ?? ""} required={!allowInternal}>
          <option value="">{allowInternal ? "Nenhum — documento interno da clínica" : "— Selecionar —"}</option>
          {families.length > 0 && (
            <optgroup label="Famílias">
              {families.map((f) => (
                <option key={f.id} value={`family:${f.id}`}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
          {patients.length > 0 && (
            <optgroup label="Pacientes">
              {patients.map((p) => (
                <option key={p.id} value={`patient:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
      <label className="mb-4 flex items-center gap-2 text-sm text-t2">
        <input type="checkbox" name="visibleToFamily" className="h-4 w-4 accent-primary" />
        Visível para a família no portal
      </label>
      <Field label="Arquivo" name="file" error={state.fieldErrors?.file} hint="PDF, imagem, Word ou XML — até 20 MB.">
        <FileInput name="file" accept={accept} required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando...">Enviar</SubmitButton>
      </div>
    </form>
  );
}

export function UploadDocumentModal(props: { action: Action; families: Option[]; patients: Option[]; allowInternal: boolean; accept: string; defaultTarget?: string }) {
  return (
    <Modal trigger="+ Novo documento" title="Novo documento" triggerSize="sm">
      {(close) => <UploadForm {...props} close={close} />}
    </Modal>
  );
}
