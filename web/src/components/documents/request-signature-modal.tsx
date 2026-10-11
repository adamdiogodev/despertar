"use client";

import { useActionState, useEffect, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
export type SignableDocument = { id: string; title: string; familyId: string | null; familyName: string | null };
export type GuardianOption = { id: string; name: string; familyId: string };
type Option = { id: string; name: string };

function RequestForm({
  action,
  documents,
  guardians,
  therapists,
  close,
}: {
  action: Action;
  documents: SignableDocument[];
  guardians: GuardianOption[];
  therapists: Option[];
  close: () => void;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [documentId, setDocumentId] = useState("");
  const doc = documents.find((d) => d.id === documentId);
  const familyGuardians = doc?.familyId ? guardians.filter((g) => g.familyId === doc.familyId) : [];
  useEffect(() => {
    if (state.ok) close();
  }, [state, close]);

  return (
    <form action={formAction} data-testid="signature-request-form">
      <FormMessage state={state} />
      <Field label="Documento" name="documentId" error={state.fieldErrors?.documentId}>
        <Select name="documentId" value={documentId} onChange={(e) => setDocumentId(e.target.value)} required>
          <option value="">— Selecionar —</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
              {d.familyName ? ` — ${d.familyName}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Signatário" name="signerId" error={state.fieldErrors?.signerId} hint="Responsáveis da família do documento ou terapeutas.">
        <Select name="signerId" required disabled={!documentId} key={documentId}>
          <option value="">— Selecionar —</option>
          {familyGuardians.length > 0 && (
            <optgroup label={`Responsáveis — ${doc?.familyName ?? ""}`}>
              {familyGuardians.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Terapeutas">
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Field>
      <Field label="Prazo" name="dueDate" error={state.fieldErrors?.dueDate}>
        <Input name="dueDate" type="date" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Solicitando...">Solicitar assinatura</SubmitButton>
      </div>
    </form>
  );
}

export function RequestSignatureModal(props: { action: Action; documents: SignableDocument[]; guardians: GuardianOption[]; therapists: Option[] }) {
  return (
    <Modal trigger="+ Solicitar assinatura" title="Solicitar assinatura" triggerSize="sm">
      {(close) => <RequestForm {...props} close={close} />}
    </Modal>
  );
}
