"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { changeAccountRole, inviteAccount, sendAccessLink, setAccountActive, SWITCHABLE_ROLES } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";

const optionalText = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value || null);

const clinicSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da clínica.").max(120),
  tax_id: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  address: optionalText,
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail inválido.")]).transform((value) => value || null),
  reschedule_min_hours: z.coerce.number().int("Use horas inteiras.").min(0, "Mínimo 0.").max(168, "Máximo 168 horas (7 dias)."),
});

export async function updateClinicSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = clinicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return fromDb(error);

  revalidatePath("/", "layout");
  return success("Dados da clínica salvos.");
}

const staffUserSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((value) => value || null),
  role: z.enum(SWITCHABLE_ROLES as ["admin", "coordination", "reception"], "Escolha o perfil."),
});

export async function createStaffUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = staffUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const result = await inviteAccount({
    email: parsed.data.email,
    fullName: parsed.data.full_name,
    role: parsed.data.role,
    phone: parsed.data.phone,
  });
  if (!result.ok) return failure(result.message, { email: [result.message] });

  revalidatePath("/settings");
  return success(`Convite enviado para ${parsed.data.email}.`);
}

const idSchema = z.guid();

export async function changeUserRole(id: string, role: string): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsedRole = z.enum(SWITCHABLE_ROLES as ["admin", "coordination", "reception"]).safeParse(role);
  if (!idSchema.safeParse(id).success || !parsedRole.success) return failure("Dados inválidos.");

  const result = await changeAccountRole(id, parsedRole.data);
  if (!result.ok) return failure(result.message);
  revalidatePath("/settings");
  return success("Perfil alterado.");
}

export async function setUserActive(id: string, active: boolean): Promise<ActionState> {
  await requireRole(["admin"]);
  if (!idSchema.safeParse(id).success) return failure("Dados inválidos.");

  const result = await setAccountActive(id, active);
  if (!result.ok) return failure(result.message);
  revalidatePath("/settings");
  return success(active ? "Acesso reativado." : "Acesso desativado.");
}

export async function resendUserAccess(id: string): Promise<ActionState> {
  await requireRole(["admin"]);
  if (!idSchema.safeParse(id).success) return failure("Dados inválidos.");

  const result = await sendAccessLink(id);
  if (!result.ok) return failure(result.message);
  return success(result.kind === "invite" ? "Convite reenviado." : "E-mail de redefinição de senha enviado.");
}

const catalogSchema = z.object({
  kind: z.enum(["therapies", "rooms"]),
  name: z.string().trim().min(2, "Informe o nome.").max(80),
});

export async function createCatalogItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = catalogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from(parsed.data.kind).insert({ name: parsed.data.name });
  if (error) {
    if (error.code === "23505") return failure("Já existe um item com este nome.", { name: ["Nome já cadastrado."] });
    return fromDb(error);
  }

  revalidatePath("/settings");
  return success(parsed.data.kind === "therapies" ? "Terapia cadastrada." : "Sala cadastrada.");
}

export async function setCatalogItemActive(kind: "therapies" | "rooms", id: string, active: boolean): Promise<ActionState> {
  await requireRole(["admin"]);
  if (!["therapies", "rooms"].includes(kind) || !idSchema.safeParse(id).success) return failure("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase.from(kind).update({ active }).eq("id", id);
  if (error) return fromDb(error);

  revalidatePath("/settings");
  return success(active ? "Reativado." : "Desativado.");
}
