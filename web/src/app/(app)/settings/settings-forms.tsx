"use client";

import { useActionState, useState, useTransition } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Field, FormMessage, Input, Select, SubmitButton, useResetOnSuccess } from "@/components/ui/form";
import { Button, cn } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import {
  changeUserRole,
  createCatalogItem,
  createStaffUser,
  resendUserAccess,
  setCatalogItemActive,
  setUserActive,
  updateClinicSettings,
} from "./actions";

type Clinic = {
  name: string;
  tax_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  email: string | null;
  reschedule_min_hours: number;
};

export function ClinicForm({ clinic }: { clinic: Clinic }) {
  const [state, action] = useActionState(updateClinicSettings, initialActionState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate data-testid="clinic-form">
      <FormMessage state={state} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Nome da clínica" name="name" error={errors.name}>
          <Input name="name" required defaultValue={clinic.name} />
        </Field>
        <Field label="CNPJ" name="tax_id" error={errors.tax_id}>
          <Input name="tax_id" defaultValue={clinic.tax_id ?? ""} />
        </Field>
        <Field label="Telefone" name="phone" error={errors.phone}>
          <Input name="phone" defaultValue={clinic.phone ?? ""} />
        </Field>
        <Field label="WhatsApp" name="whatsapp" error={errors.whatsapp}>
          <Input name="whatsapp" defaultValue={clinic.whatsapp ?? ""} />
        </Field>
      </div>
      <Field label="Endereço" name="address" error={errors.address}>
        <Input name="address" defaultValue={clinic.address ?? ""} />
      </Field>
      <Field label="E-mail institucional" name="email" error={errors.email}>
        <Input name="email" type="email" defaultValue={clinic.email ?? ""} />
      </Field>
      <Field
        label="Antecedência mínima para remarcação (horas)"
        name="reschedule_min_hours"
        error={errors.reschedule_min_hours}
        hint="As famílias só conseguem pedir remarcação ou cancelar uma sessão com pelo menos esta antecedência."
      >
        <Input name="reschedule_min_hours" type="number" min={0} max={168} step={1} required defaultValue={clinic.reschedule_min_hours} />
      </Field>
      <SubmitButton>Salvar alterações</SubmitButton>
    </form>
  );
}

const STAFF_ROLE_OPTIONS = [
  { value: "reception", label: "Recepção" },
  { value: "coordination", label: "Coordenação" },
  { value: "admin", label: "Administrador" },
];

export function NewStaffUserButton() {
  const [state, action] = useActionState(createStaffUser, initialActionState);
  const formRef = useResetOnSuccess(state);
  const errors = state.fieldErrors ?? {};
  return (
    <Modal trigger="+ Novo usuário" title="Novo usuário da equipe" triggerSize="sm">
      <form ref={formRef} action={action} noValidate data-testid="new-user-form">
        <FormMessage state={state} />
        <Field label="Nome completo" name="full_name" error={errors.full_name}>
          <Input name="full_name" required />
        </Field>
        <Field label="E-mail (login)" name="email" error={errors.email}>
          <Input name="email" type="email" required />
        </Field>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Telefone" name="phone" error={errors.phone}>
            <Input name="phone" />
          </Field>
          <Field label="Perfil" name="role" error={errors.role}>
            <Select name="role" defaultValue="reception">
              {STAFF_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mb-4 text-xs text-t3">
          Terapeutas são criados em Terapeutas › Novo terapeuta; responsáveis, na ficha da família. O usuário recebe um convite por e-mail para definir a senha.
        </p>
        <SubmitButton pendingLabel="Enviando convite...">Criar e enviar convite</SubmitButton>
      </form>
    </Modal>
  );
}

export function UserRowActions({
  id,
  role,
  active,
  canSwitchRole,
  isSelf,
}: {
  id: string;
  role: string;
  active: boolean;
  canSwitchRole: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const run = (action: () => Promise<ActionState>) => startTransition(async () => setResult(await action()));

  if (isSelf) return <span className="text-[11px] text-t3">Sua conta</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {canSwitchRole && (
          <select
            aria-label="Trocar perfil"
            defaultValue={role}
            disabled={pending}
            onChange={(event) => run(() => changeUserRole(id, event.target.value))}
            className="rounded-md border border-line bg-white px-2 py-1 text-xs"
            data-testid="change-role"
          >
            {STAFF_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resendUserAccess(id))}>
          Reenviar acesso
        </Button>
        <Button
          variant={active ? "ghost" : "success"}
          size="sm"
          disabled={pending}
          data-testid="toggle-active"
          onClick={() => {
            if (active && !confirm("Desativar este acesso? A pessoa não conseguirá mais entrar no sistema.")) return;
            run(() => setUserActive(id, !active));
          }}
        >
          {active ? "Desativar" : "Reativar"}
        </Button>
      </div>
      {result?.message && <span className={cn("text-[11px]", result.ok ? "text-ok" : "text-danger")}>{result.message}</span>}
    </div>
  );
}

export function NewCatalogItemForm({ kind, placeholder }: { kind: "therapies" | "rooms"; placeholder: string }) {
  const [state, action] = useActionState(createCatalogItem, initialActionState);
  const formRef = useResetOnSuccess(state);
  return (
    <form ref={formRef} action={action} noValidate className="mt-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex gap-2">
        <Input name="name" placeholder={placeholder} aria-label={placeholder} required />
        <SubmitButton size="sm" pendingLabel="...">
          Adicionar
        </SubmitButton>
      </div>
      {state.message && <p className={cn("mt-1 text-[11px]", state.ok ? "text-ok" : "text-danger")}>{state.message}</p>}
    </form>
  );
}

export function CatalogToggle({ kind, id, active }: { kind: "therapies" | "rooms"; id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => void (await setCatalogItemActive(kind, id, !active)))}
    >
      {active ? "Desativar" : "Ativar"}
    </Button>
  );
}
