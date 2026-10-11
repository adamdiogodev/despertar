"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STAFF_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type ActionState, fromDb, fromZod, success } from "@/lib/action-state";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null);
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Data inválida.")
  .transform((value) => value || null);

const patientFields = {
  full_name: z.string().trim().min(2, "Informe o nome completo.").max(160),
  birth_date: optionalDate,
  diagnosis: optionalText,
  insurance_name: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || "Particular"),
  insurance_number: optionalText,
  school: optionalText,
  care_started_on: optionalDate,
};

const createSchema = z.object({ family_id: z.string().guid("Selecione a família."), ...patientFields });
const updateSchema = z.object({
  id: z.string().guid(),
  status: z.enum(["active", "pending", "inactive"]),
  ...patientFields,
});

export async function createPatient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("patients").insert(parsed.data).select("id").single();
  if (error) return fromDb(error);

  revalidatePath("/patients");
  revalidatePath(`/families/${parsed.data.family_id}`);
  redirect(`/patients/${data.id}`);
}

export async function updatePatient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update(fields).eq("id", id);
  if (error) return fromDb(error);

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return success("Dados do paciente atualizados.");
}
