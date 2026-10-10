"use client";

import { useActionState, useTransition, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea, useResetOnSuccess } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { addGuardian, createFamily, removeGuardian, saveInternalNotes, setPrimaryGuardian, updateFamily } from "./actions";

type Family = {
  id: string;
  name: string;
  address: string | null;
  status: "active" | "pending" | "inactive";
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
};

function FamilyFields({ state, family }: { state: ActionState; family?: Family }) {
  const errors = state.fieldErrors ?? {};
  return (
    <>
      <Field label="Nome da família" name="name" error={errors.name}>
        <Input name="name" required defaultValue={family?.name ?? "Família "} />
      </Field>
      <Field label="Endereço" name="address" error={errors.address}>
        <Input name="address" defaultValue={family?.address ?? ""} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Contato de emergência" name="emergency_contact_name" error={errors.emergency_contact_name}>
          <Input name="emergency_contact_name" defaultValue={family?.emergency_contact_name ?? ""} />
        </Field>
        <Field label="Telefone" name="emergency_contact_phone" error={errors.emergency_contact_phone}>
          <Input name="emergency_contact_phone" defaultValue={family?.emergency_contact_phone ?? ""} />
        </Field>
        <Field label="Parentesco" name="emergency_contact_relationship" error={errors.emergency_contact_relationship}>
          <Input name="emergency_contact_relationship" defaultValue={family?.emergency_contact_relationship ?? ""} />
        </Field>
      </div>
    </>
  );
}

function GuardianFields({ state }: { state: ActionState }) {
  const errors = state.fieldErrors ?? {};
  return (
    <>
      <Field label="Nome completo" name="guardian_name" error={errors.guardian_name}>
        <Input name="guardian_name" required />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="E-mail (login)" name="guardian_email" error={errors.guardian_email}>
          <Input name="guardian_email" type="email" required data-testid="guardian-email" />
        </Field>
        <Field label="Telefone" name="guardian_phone" error={errors.guardian_phone}>
          <Input name="guardian_phone" />
        </Field>
      </div>
      <Field label="Parentesco" name="guardian_relationship" error={errors.guardian_relationship}>
        <Input name="guardian_relationship" required defaultValue="Mãe" />
      </Field>
    </>
  );
}

export function NewFamilyButton() {
  const [state, action] = useActionState(createFamily, initialActionState);
  return (
    <Modal trigger="+ Nova família" title="Nova família" wide>
      <form action={action} noValidate data-testid="new-family-form">
        <FormMessage state={state} />
        <FamilyFields state={state} />
        <div className="mb-3 mt-2 border-t border-line pt-4 text-xs font-bold uppercase tracking-wide text-t3">Responsável principal</div>
        <GuardianFields state={state} />
        <p className="mb-4 text-xs text-t3">O responsável recebe um convite por e-mail para definir a própria senha e acessar o Portal da Família.</p>
        <SubmitButton pendingLabel="Criando...">Criar família</SubmitButton>
      </form>
    </Modal>
  );
}

export function FamilyEditForm({ family }: { family: Family }) {
  const [state, action] = useActionState(updateFamily, initialActionState);
  return (
    <form action={action} noValidate data-testid="family-edit-form">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={family.id} />
      <FamilyFields state={state} family={family} />
      <Field label="Status" name="status">
        <Select name="status" defaultValue={family.status}>
          <option value="active">Ativa</option>
          <option value="pending">Aguardando</option>
          <option value="inactive">Inativa</option>
        </Select>
      </Field>
      <SubmitButton size="sm">Salvar dados</SubmitButton>
    </form>
  );
}

export function AddGuardianButton({ familyId }: { familyId: string }) {
  const [state, action] = useActionState(addGuardian, initialActionState);
  const formRef = useResetOnSuccess(state);
  return (
    <Modal trigger="+ Responsável" title="Adicionar responsável" triggerVariant="outline" triggerSize="sm">
      <form ref={formRef} action={action} noValidate data-testid="add-guardian-form">
        <FormMessage state={state} />
        <input type="hidden" name="family_id" value={familyId} />
        <GuardianFields state={state} />
        <label className="mb-4 flex items-center gap-2 text-sm text-t2">
          <input type="checkbox" name="is_primary" /> Responsável principal
        </label>
        <p className="mb-4 text-xs text-t3">
          Se o e-mail já for de um responsável cadastrado, ele é apenas vinculado. Caso contrário, uma conta é criada e o convite é enviado.
        </p>
        <SubmitButton pendingLabel="Adicionando...">Adicionar</SubmitButton>
      </form>
    </Modal>
  );
}

export function GuardianActions({ familyId, profileId, isPrimary, name }: { familyId: string; profileId: string; isPrimary: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionState | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {message && !message.ok && <span className="text-[11px] text-danger">{message.message}</span>}
      {!isPrimary && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => setMessage(await setPrimaryGuardian(familyId, profileId)))}
        >
          Tornar principal
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        data-testid="remove-guardian"
        onClick={() => {
          if (!confirm(`Remover o vínculo de ${name} com esta família? A conta não é excluída.`)) return;
          startTransition(async () => setMessage(await removeGuardian(familyId, profileId)));
        }}
      >
        Remover
      </Button>
    </div>
  );
}

export function InternalNotesForm({ familyId, notes }: { familyId: string; notes: string }) {
  const [state, action] = useActionState(saveInternalNotes, initialActionState);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="family_id" value={familyId} />
      <Textarea name="notes" rows={5} defaultValue={notes} placeholder="Observações visíveis só para a equipe e terapeutas vinculados." data-testid="family-notes" />
      <SubmitButton size="sm" className="mt-3">
        Salvar observações
      </SubmitButton>
    </form>
  );
}
