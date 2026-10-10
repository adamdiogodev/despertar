"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { parseMoneyToCents } from "@/lib/format";
import { PAYMENT_METHODS } from "@/components/finance/logic";

const chargeSchema = z.object({
  family_id: z.string().uuid("Selecione a família."),
  reference: z.string().trim().min(3, "Informe a referência.").max(120),
  amount: z.string().trim().min(1, "Informe o valor."),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  payment_method: z.enum(PAYMENT_METHODS, "Selecione a forma de pagamento."),
  status: z.enum(["pending", "paid", "awaiting_insurance"], "Selecione o status."),
});

export async function createCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(MANAGER_ROLES);
  const parsed = chargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents == null || amountCents <= 0) return failure("Verifique os campos destacados.", { amount: ["Valor inválido."] });

  const supabase = await createClient();
  const { error } = await supabase.from("charges").insert({
    family_id: parsed.data.family_id,
    reference: parsed.data.reference,
    amount_cents: amountCents,
    due_date: parsed.data.due_date,
    payment_method: parsed.data.payment_method,
    status: parsed.data.status,
    paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
    created_by: user.id,
  });
  if (error) return fromDb(error);
  revalidatePath("/finance");
  return success("Cobrança criada.");
}

const idSchema = z.object({ id: z.string().guid() });

async function updateChargeStatus(formData: FormData, status: "paid" | "canceled", message: string): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("Cobrança inválida.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charges")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .in("status", ["pending", "awaiting_insurance"])
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Cobrança não encontrada ou já finalizada.");
  revalidatePath("/finance");
  return success(message);
}

export async function markChargePaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return updateChargeStatus(formData, "paid", "Cobrança marcada como paga.");
}

export async function cancelCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return updateChargeStatus(formData, "canceled", "Cobrança cancelada.");
}
