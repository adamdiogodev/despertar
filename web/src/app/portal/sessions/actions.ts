"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { zonedToIso } from "@/lib/format";

const rescheduleSchema = z.object({
  appointmentId: z.string().guid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário."),
  reason: z.string().trim().min(3, "Conte rapidamente o motivo.").max(1000),
});

export async function requestReschedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["guardian"]);
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { appointmentId, date, time, reason } = parsed.data;

  const proposed = zonedToIso(date, time);
  if (new Date(proposed).getTime() <= Date.now()) return failure("A nova data precisa estar no futuro.", { date: ["Escolha uma data futura."] });

  const supabase = await createClient();
  // The database re-checks the minimum notice and that the session is ours.
  const { error } = await supabase.rpc("request_reschedule", {
    target_appointment: appointmentId,
    proposed_start: proposed,
    request_reason: reason,
  });
  if (error) {
    if (error.code === "23505") return failure("Já existe uma solicitação de remarcação pendente para esta sessão.");
    return fromDb(error);
  }
  revalidatePath("/portal/sessions");
  return success("Solicitação enviada! A clínica vai analisar e você será avisado(a).");
}

const cancelSchema = z.object({
  appointmentId: z.string().guid(),
  reason: z.string().trim().min(3, "Conte rapidamente o motivo.").max(1000),
});

export async function cancelAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["guardian"]);
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("guardian_cancel_appointment", {
    target_appointment: parsed.data.appointmentId,
    cancel_reason_text: parsed.data.reason,
  });
  if (error) return fromDb(error);
  revalidatePath("/portal/sessions");
  revalidatePath("/portal");
  return success("Sessão cancelada. A clínica foi avisada.");
}
