"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { formatCents, parseMoneyToCents } from "@/lib/format";
import { removeUserFile, resolveUpload } from "@/lib/files";
import { receiptFileError } from "@/components/finance/logic";

// Only the admin writes payout periods and reviews invoices (RLS and RPCs agree).
const ADMIN = ["admin"] as const;

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const periodSchema = z
  .object({
    label: z.string().trim().min(3, "Informe um rótulo.").max(80),
    starts_on: dateField,
    ends_on: dateField,
  })
  .refine((v) => v.ends_on >= v.starts_on, { path: ["ends_on"], message: "O fim deve ser igual ou posterior ao início." });

export async function createPeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole([...ADMIN]);
  const parsed = periodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("payout_periods").insert({ ...parsed.data, created_by: user.id });
  if (error) return fromDb(error);
  revalidatePath("/finance/invoices");
  return success("Período criado.");
}

const periodIdSchema = z.object({ period_id: z.string().guid() });

export type GenerateState = ActionState & { lines?: { text: string; missing: boolean }[] };

export async function generateRequests(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  await requireRole([...ADMIN]);
  const parsed = periodIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("Período inválido.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_invoice_requests", { target_period: parsed.data.period_id });
  if (error) return fromDb(error);

  revalidatePath(`/finance/invoices/${parsed.data.period_id}`);
  revalidatePath("/finance/invoices");
  if (!data.length) return success("Nenhuma sessão concluída pendente de faturamento neste período.");

  const [therapists, therapies] = await Promise.all([
    supabase.from("therapists").select("id, profile:profiles(full_name)"),
    supabase.from("therapies").select("id, name"),
  ]);
  const therapistName = new Map((therapists.data ?? []).map((t) => [t.id, t.profile?.full_name ?? "Terapeuta"]));
  const therapyName = new Map((therapies.data ?? []).map((t) => [t.id, t.name]));

  const lines = data.map((row) => {
    const who = `${therapistName.get(row.therapist_id) ?? "Terapeuta"} — ${therapyName.get(row.therapy_id) ?? "Terapia"}`;
    return row.missing_rate
      ? { text: `${who}: ${row.sessions} sessão(ões) sem valor cadastrado — não faturadas`, missing: true }
      : { text: `${who}: ${row.sessions} sessão(ões), ${formatCents(row.amount_cents)}`, missing: false };
  });
  const created = lines.filter((l) => !l.missing).length;
  const missing = lines.length - created;
  return {
    ...success(`${created} solicitação(ões) gerada(s) ou atualizada(s); os terapeutas foram avisados.${missing ? ` ${missing} sem valor cadastrado.` : ""}`),
    lines,
  };
}

const requestSchema = z.object({ id: z.string().guid() });

// Payout data shows up in the period pages, the professionals view and "Minhas Notas Fiscais".
function revalidatePayouts() {
  revalidatePath("/finance", "layout");
  revalidatePath("/invoices");
}

export async function approveInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = requestSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return failure("Solicitação inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_invoice", { target_request: parsed.data.id, approve: true });
  if (error) return fromDb(error);
  revalidatePayouts();
  return success("Nota aprovada.");
}

const rejectSchema = requestSchema.extend({ reason: z.string().trim().min(3, "Informe o motivo da recusa.").max(500) });

export async function rejectInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = rejectSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_invoice", { target_request: parsed.data.id, approve: false, reason: parsed.data.reason });
  if (error) return fromDb(error);
  revalidatePayouts();
  return success("Nota recusada; o profissional foi avisado.");
}

function hasReceipt(formData: FormData): boolean {
  return typeof formData.get("file") === "string";
}

// Resolves the browser-uploaded receipt and checks it is a PDF or image.
async function resolveReceipt(userId: string, formData: FormData) {
  const upload = await resolveUpload(userId, formData);
  if (!upload.ok) return upload;
  const invalid = receiptFileError({ type: upload.mimeType, size: upload.size });
  if (invalid) {
    await removeUserFile(upload.path);
    return { ok: false as const, message: invalid };
  }
  return upload;
}

// Marks an approved invoice as paid, optionally with the transfer receipt.
export async function payInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole([...ADMIN]);
  const parsed = requestSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return failure("Solicitação inválida.");

  let receiptPath: string | undefined;
  if (hasReceipt(formData)) {
    const upload = await resolveReceipt(user.id, formData);
    if (!upload.ok) return failure(upload.message, { file: [upload.message] });
    receiptPath = upload.path;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_invoice_paid", { target_request: parsed.data.id, receipt_path: receiptPath });
  if (error) {
    if (receiptPath) await removeUserFile(receiptPath);
    return fromDb(error);
  }
  revalidatePayouts();
  return success(receiptPath ? "Repasse registrado com comprovante." : "Repasse registrado.");
}

export async function attachPayoutReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole([...ADMIN]);
  const parsed = requestSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return failure("Solicitação inválida.");

  const upload = await resolveReceipt(user.id, formData);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_payout_receipt", { target_request: parsed.data.id, path: upload.path });
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  revalidatePayouts();
  return success("Comprovante anexado.");
}

const manualSchema = z.object({
  payee: z.string().guid("Selecione o profissional."),
  amount: z.string().trim().min(1, "Informe o valor."),
  description: z.string().trim().min(3, "Descreva o que está sendo pago.").max(300),
});

export async function createManualRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents == null || amountCents <= 0) return failure("Verifique os campos destacados.", { amount: ["Valor inválido."] });

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_manual_invoice_request", {
    payee: parsed.data.payee,
    amount: amountCents,
    request_description: parsed.data.description,
  });
  if (error) return fromDb(error);
  revalidatePayouts();
  return success("Solicitação enviada; o profissional foi avisado.");
}

export async function closePeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = periodIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("Período inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payout_periods")
    .update({ status: "closed" })
    .eq("id", parsed.data.period_id)
    .eq("status", "open")
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Período não encontrado ou já fechado.");
  revalidatePayouts();
  return success("Período fechado.");
}
