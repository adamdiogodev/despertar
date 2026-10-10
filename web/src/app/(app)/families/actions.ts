"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { requireRole, STAFF_ROLES } from "@/lib/auth";
import { discardNewAccount, inviteAccount } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";

const optionalText = z
  .string()
  .trim()
  .max(300)
  .transform((value) => value || null);

const familyFields = {
  name: z.string().trim().min(2, "Informe o nome da família.").max(120),
  address: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
  emergency_contact_relationship: optionalText,
};

const guardianFields = {
  guardian_name: z.string().trim().min(2, "Informe o nome do responsável.").max(120),
  guardian_email: z.string().trim().toLowerCase().email("E-mail inválido."),
  guardian_phone: optionalText,
  guardian_relationship: z.string().trim().min(2, "Informe o parentesco.").max(60),
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Reuses an existing guardian account (a parent with children in two families)
// or invites a new one. Accounts of other roles are never turned into guardians.
async function ensureGuardianAccount(
  supabase: Supabase,
  input: { email: string; fullName: string; phone: string | null },
): Promise<{ ok: true; id: string; created: boolean } | { ok: false; message: string }> {
  const { data: existing } = await supabase.from("profiles").select("id, role").eq("email", input.email).maybeSingle();
  if (existing) {
    if (existing.role !== "guardian") return { ok: false, message: "Este e-mail pertence a um membro da equipe." };
    return { ok: true, id: existing.id, created: false };
  }
  const invited = await inviteAccount({ email: input.email, fullName: input.fullName, role: "guardian", phone: input.phone });
  return invited.ok ? { ok: true, id: invited.id, created: true } : invited;
}

const createFamilySchema = z.object({ ...familyFields, ...guardianFields });

export async function createFamily(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = createFamilySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { guardian_name, guardian_email, guardian_phone, guardian_relationship, ...family } = parsed.data;

  const supabase = await createClient();
  const account = await ensureGuardianAccount(supabase, { email: guardian_email, fullName: guardian_name, phone: guardian_phone });
  if (!account.ok) return failure(account.message, { guardian_email: [account.message] });

  const { data: created, error } = await supabase.from("families").insert(family).select("id").single();
  const { error: linkError } = created
    ? await supabase
        .from("guardians")
        .insert({ family_id: created.id, profile_id: account.id, relationship: guardian_relationship, is_primary: true })
    : { error: null };
  if (error || linkError || !created) {
    if (account.created) await discardNewAccount(account.id, "guardian");
    return fromDb(error ?? linkError);
  }

  revalidatePath("/families");
  redirect(`/families/${created.id}?created=1`);
}

const updateFamilySchema = z.object({
  id: z.guid(),
  ...familyFields,
  status: z.enum(["active", "pending", "inactive"]),
});

export async function updateFamily(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = updateFamilySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("families").update(values).eq("id", id);
  if (error) return fromDb(error);

  revalidatePath("/families", "layout");
  return success("Dados da família atualizados.");
}

const addGuardianSchema = z.object({
  family_id: z.guid(),
  ...guardianFields,
  is_primary: z.literal("on").optional(),
});

export async function addGuardian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = addGuardianSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { family_id, guardian_name, guardian_email, guardian_phone, guardian_relationship, is_primary } = parsed.data;

  const supabase = await createClient();
  const { data: family } = await supabase.from("families").select("id").eq("id", family_id).maybeSingle();
  if (!family) return failure("Família não encontrada.");

  const account = await ensureGuardianAccount(supabase, { email: guardian_email, fullName: guardian_name, phone: guardian_phone });
  if (!account.ok) return failure(account.message, { guardian_email: [account.message] });

  if (is_primary) {
    const { error } = await supabase.from("guardians").update({ is_primary: false }).eq("family_id", family_id);
    if (error) return fromDb(error);
  }
  const { error } = await supabase.from("guardians").insert({
    family_id,
    profile_id: account.id,
    relationship: guardian_relationship,
    is_primary: Boolean(is_primary),
  });
  if (error) {
    if (account.created) await discardNewAccount(account.id, "guardian");
    if (error.code === "23505") return failure("Este responsável já está vinculado à família.");
    return fromDb(error);
  }

  revalidatePath(`/families/${family_id}`);
  return success(account.created ? "Responsável adicionado. O convite de acesso foi enviado por e-mail." : "Responsável existente vinculado à família.");
}

const guardianLinkSchema = z.object({ family_id: z.guid(), profile_id: z.guid() });

// Removes only the link; the account stays (it may belong to other families).
export async function removeGuardian(familyId: string, profileId: string): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = guardianLinkSchema.safeParse({ family_id: familyId, profile_id: profileId });
  if (!parsed.success) return failure("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase.from("guardians").delete().match(parsed.data);
  if (error) return fromDb(error);

  revalidatePath(`/families/${familyId}`);
  return success("Vínculo removido.");
}

export async function setPrimaryGuardian(familyId: string, profileId: string): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = guardianLinkSchema.safeParse({ family_id: familyId, profile_id: profileId });
  if (!parsed.success) return failure("Dados inválidos.");

  const supabase = await createClient();
  const { error: clearError } = await supabase.from("guardians").update({ is_primary: false }).eq("family_id", familyId);
  const { error } = clearError ? { error: clearError } : await supabase.from("guardians").update({ is_primary: true }).match(parsed.data);
  if (error) return fromDb(error);

  revalidatePath(`/families/${familyId}`);
  return success("Responsável principal atualizado.");
}

const notesSchema = z.object({ family_id: z.guid(), notes: z.string().max(5000) });

export async function saveInternalNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(STAFF_ROLES);
  const parsed = notesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("family_internal_notes").upsert({
    family_id: parsed.data.family_id,
    notes: parsed.data.notes.trim(),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return fromDb(error);

  revalidatePath(`/families/${parsed.data.family_id}`);
  return success("Observações salvas.");
}
