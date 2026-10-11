"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { parseMoneyToCents } from "@/lib/format";
import { removeUserFile, uploadUserFile } from "@/lib/files";
import { PAYMENT_METHODS, receiptFileError } from "@/components/finance/logic";

const chargeSchema = z.object({
  family_id: z.string().guid("Selecione a família."),
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

const statusSchema = z.object({
  id: z.string().guid(),
  status: z.enum(["pending", "paid", "awaiting_insurance", "canceled"], "Selecione o status."),
});

// Managers may move a charge between any stored status; "Atrasado" stays derived from the due date.
export async function setChargeStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const parsed = statusSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return failure("Status inválido.");

  const supabase = await createClient();
  const { data: current } = await supabase.from("charges").select("status, paid_at").eq("id", parsed.data.id).maybeSingle();
  if (!current) return failure("Cobrança não encontrada.");
  if (current.status === parsed.data.status) return success("Status mantido.");

  const paidAt = parsed.data.status === "paid" ? (current.paid_at ?? new Date().toISOString()) : null;
  const { error } = await supabase.from("charges").update({ status: parsed.data.status, paid_at: paidAt }).eq("id", parsed.data.id);
  if (error) return fromDb(error);
  revalidatePath("/finance");
  revalidatePath("/portal/finance");
  return success("Status atualizado.");
}

export async function attachChargeReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(MANAGER_ROLES);
  const parsed = z.object({ id: z.string().guid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) return failure("Cobrança inválida.");

  const file = formData.get("file") instanceof File ? (formData.get("file") as File) : null;
  const invalid = receiptFileError(file);
  if (invalid) return failure("Verifique os campos destacados.", { file: [invalid] });
  const upload = await uploadUserFile(user.id, file);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_charge_receipt", { target_charge: parsed.data.id, path: upload.path });
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  revalidatePath("/finance");
  revalidatePath("/portal/finance");
  return success("Comprovante anexado.");
}
