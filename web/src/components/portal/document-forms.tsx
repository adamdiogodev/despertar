"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Modal } from "@/components/ui/modal";
import { Field, FormMessage, Input, Select, SubmitButton, useResetOnSuccess } from "@/components/ui/form";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function SignDocumentButton({ requestId, title, fileHref, action }: { requestId: string; title: string; fileHref: string; action: Action }) {
  return (
    <Modal trigger="✍ Assinar" triggerSize="sm" title="Assinar documento">
      {() => <SignForm requestId={requestId} title={title} fileHref={fileHref} action={action} />}
    </Modal>
  );
}

function SignForm({ requestId, title, fileHref, action }: { requestId: string; title: string; fileHref: string; action: Action }) {
  const [state, formAction] = useActionState(action, initialActionState);
  if (state.ok) {
    return (
      <div className="py-4 text-center">
        <div className="mb-3 text-4xl">✅</div>
        <p className="text-sm font-semibold text-t1">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={formAction} data-testid="sign-form">
      <div className="mb-4 rounded-lg bg-line-light p-4 text-center">
        <div className="mb-2 text-4xl">📄</div>
        <div className="font-bold text-t1">{title}</div>
        <a href={fileHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
          Abrir o documento para ler
        </a>
      </div>
      <FormMessage state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className="mb-3 flex items-start gap-2 text-sm text-t1">
        <input type="checkbox" name="agree" required className="mt-1" />
        <span>Li o documento e concordo com o seu conteúdo.</span>
      </label>
      {state.fieldErrors?.agree && <p className="mb-3 text-xs text-danger">{state.fieldErrors.agree.join(" ")}</p>}
      <p className="mb-4 text-xs text-t3">
        Esta é uma assinatura por aceite eletrônico: ao confirmar, registramos seu nome, a data e a hora, o endereço IP e o navegador
        utilizados, como comprovante da sua concordância.
      </p>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Registrando...">Assinar eletronicamente</SubmitButton>
      </div>
    </form>
  );
}

export function UploadDocumentForm({
  childOptions,
  defaultChildId,
  accept,
  action,
}: {
  childOptions: { id: string; name: string }[];
  defaultChildId: string | null;
  accept: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} data-testid="upload-document-form">
      <FormMessage state={state} />
      <Field label="Nome do documento" name="title" error={state.fieldErrors?.title}>
        <Input name="title" required maxLength={150} placeholder="Ex.: Laudo do neuropediatra" />
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Tipo" name="category" error={state.fieldErrors?.category}>
          <Select name="category" defaultValue="medical">
            <option value="medical">Laudo, receita ou exame</option>
            <option value="other">Outro (carta da escola, declaração…)</option>
          </Select>
        </Field>
        <Field label="Criança" name="patientId" error={state.fieldErrors?.patientId}>
          <Select name="patientId" defaultValue={defaultChildId ?? childOptions[0]?.id} required>
            {childOptions.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Arquivo" name="file" error={state.fieldErrors?.file} hint="PDF, imagem ou Word — até 20 MB.">
        <Input type="file" name="file" accept={accept} required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enviando...">📤 Enviar à clínica</SubmitButton>
      </div>
    </form>
  );
}
