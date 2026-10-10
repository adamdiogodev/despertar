"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { formatCents } from "@/lib/format";

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

const requestSchema = z.object({ id: z.string().guid(), period_id: z.string().guid() });

function revalidatePeriod(periodId: string) {
  revalidatePath(`/finance/invoices/${periodId}`);
  revalidatePath("/finance/invoices");
  revalidatePath("/finance");
}

export async function approveInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("Solicitação inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_invoice", { target_request: parsed.data.id, approve: true });
  if (error) return fromDb(error);
  revalidatePeriod(parsed.data.period_id);
  return success("Nota aprovada.");
}

const rejectSchema = requestSchema.extend({ reason: z.string().trim().min(3, "Informe o motivo da recusa.").max(500) });

export async function rejectInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = rejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_invoice", { target_request: parsed.data.id, approve: false, reason: parsed.data.reason });
  if (error) return fromDb(error);
  revalidatePeriod(parsed.data.period_id);
  return success("Nota recusada; o terapeuta foi avisado.");
}

export async function payInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([...ADMIN]);
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("Solicitação inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_invoice_paid", { target_request: parsed.data.id });
  if (error) return fromDb(error);
  revalidatePeriod(parsed.data.period_id);
  return success("Repasse registrado.");
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
  revalidatePeriod(parsed.data.period_id);
  return success("Período fechado.");
}
