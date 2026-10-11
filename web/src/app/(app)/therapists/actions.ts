"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { discardNewAccount, inviteAccount } from "@/lib/accounts";
import { parseMoneyToCents } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const therapistFields = {
  specialty: z.string().trim().min(2, "Informe a especialidade.").max(80),
  council_registry: z
    .string()
    .trim()
    .max(40)
    .transform((value) => value || null),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
};

const createSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((value) => value || null),
  ...therapistFields,
});

export async function createTherapist(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { full_name, email, phone, ...therapist } = parsed.data;

  const account = await inviteAccount({ email, fullName: full_name, role: "therapist", phone });
  if (!account.ok) return failure(account.message, { email: [account.message] });

  const supabase = await createClient();
  const { error } = await supabase.from("therapists").insert({ id: account.id, ...therapist });
  if (error) {
    await discardNewAccount(account.id, "therapist");
    return fromDb(error);
  }

  revalidatePath("/therapists");
  redirect(`/therapists/${account.id}?created=1`);
}

const updateSchema = z.object({ id: z.guid(), ...therapistFields });

export async function updateTherapist(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("therapists").update(values).eq("id", id);
  if (error) return fromDb(error);

  revalidatePath("/therapists", "layout");
  return success("Dados profissionais atualizados.");
}

const rateSchema = z.object({
  therapist_id: z.guid(),
  therapy_id: z.guid("Escolha a terapia."),
  pay_model: z.enum(["per_session", "per_hour"]),
  amount: z.string().transform((value, ctx) => {
    const cents = parseMoneyToCents(value);
    if (cents == null || cents <= 0) {
      ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero." });
      return z.NEVER;
    }
    return cents;
  }),
  valid_from: z.iso.date("Informe a data de início."),
});

export async function addTherapistRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = rateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { amount, ...rate } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("therapist_rates").insert({ ...rate, amount_cents: amount });
  if (error) {
    if (error.code === "23505") return failure("Já existe um valor desta terapia com início nesta data.");
    return fromDb(error);
  }

  revalidatePath(`/therapists/${rate.therapist_id}`);
  return success("Valor de repasse cadastrado.");
}
