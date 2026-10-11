"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { zonedToIso } from "@/lib/format";
import { weeklyOccurrences } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export type CreateAppointmentsState = ActionState & {
  results?: { date: string; ok: boolean; error?: string }[];
};

const optionalText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((value) => value || null);
const optionalUuid = z
  .union([z.literal(""), z.string().guid()])
  .optional()
  .transform((value) => value || null);
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida");
const durationField = z.coerce.number().int().min(10, "Mínimo de 10 minutos").max(480, "Máximo de 8 horas");

function revalidateSchedule() {
  revalidatePath("/schedule");
  revalidatePath("/schedule/requests");
}

function form(formData: FormData) {
  return Object.fromEntries(formData);
}

const notAllowed = failure("Você não tem permissão para alterar esta sessão.");

const createSchema = z.object({
  patient_id: z.string().guid("Selecione o paciente"),
  assignment: z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, "Selecione terapeuta e terapia"),
  date: dateField,
  time: timeField,
  duration: durationField,
  room_id: optionalUuid,
  notes: optionalText,
  weeks: z.coerce.number().int().min(1).max(26, "Máximo de 26 semanas"),
});

export async function createAppointments(_prev: CreateAppointmentsState, formData: FormData): Promise<CreateAppointmentsState> {
  const user = await requireRole(STAFF_ROLES);
  const parsed = createSchema.safeParse(form(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { patient_id, assignment, date, time, duration, room_id, notes, weeks } = parsed.data;
  const [therapist_id, therapy_id] = assignment.split(":");

  const supabase = await createClient();
  const results: NonNullable<CreateAppointmentsState["results"]> = [];
  // One insert per occurrence so a conflict on one week does not block the others.
  for (const occurrence of weeklyOccurrences(date, time, duration, weeks)) {
    const { error } = await supabase.from("appointments").insert({
      patient_id,
      therapist_id,
      therapy_id,
      room_id,
      notes,
      starts_at: occurrence.startsAt,
      ends_at: occurrence.endsAt,
      created_by: user.id,
    });
    results.push({ date: occurrence.date, ok: !error, error: error ? fromDb(error).message : undefined });
  }

  const created = results.filter((result) => result.ok).length;
  if (created > 0) revalidateSchedule();
  const message =
    created === results.length
      ? created === 1
        ? "Sessão agendada."
        : `${created} sessões agendadas.`
      : `${created} de ${results.length} sessões agendadas.`;
  return { ok: created === results.length, message, results: results.length > 1 || created === 0 ? results : undefined };
}

const updateSchema = z.object({
  id: z.string().guid(),
  date: dateField,
  time: timeField,
  duration: durationField,
  room_id: optionalUuid,
  notes: optionalText,
});

export async function updateAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = updateSchema.safeParse(form(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, date, time, duration, room_id, notes } = parsed.data;
  const startsAt = zonedToIso(date, time);
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ starts_at: startsAt, ends_at: endsAt, room_id, notes })
    .eq("id", id)
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return notAllowed;
  revalidateSchedule();
  return success("Sessão atualizada.");
}

const statusSchema = z.object({ id: z.string().guid(), status: z.enum(["confirmed", "no_show"]) });

// Confirm / no-show. Therapists may do it on their own sessions (trigger + RLS enforce).
export async function setAppointmentStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEAM_ROLES);
  const parsed = statusSchema.safeParse(form(formData));
  if (!parsed.success) return failure("Dados inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").update({ status: parsed.data.status }).eq("id", parsed.data.id).select("id");
  if (error) return fromDb(error);
  if (!data?.length) return notAllowed;
  revalidateSchedule();
  return success(parsed.data.status === "confirmed" ? "Sessão confirmada." : "Falta registrada.");
}

const completeSchema = z.object({ id: z.string().guid(), minutes: durationField });

// The real duration becomes ends_at — it is the base of hourly invoices.
export async function completeAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEAM_ROLES);
  const parsed = completeSchema.safeParse(form(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data: appointment } = await supabase.from("appointments").select("starts_at").eq("id", parsed.data.id).maybeSingle();
  if (!appointment) return notAllowed;
  const endsAt = new Date(new Date(appointment.starts_at).getTime() + parsed.data.minutes * 60000).toISOString();

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "completed", ends_at: endsAt })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return notAllowed;
  revalidateSchedule();
  return success("Sessão concluída.");
}

const cancelSchema = z.object({
  id: z.string().guid(),
  cancel_reason: z.string().trim().min(3, "Informe o motivo do cancelamento").max(500),
});

export async function cancelAppointment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = cancelSchema.safeParse(form(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "canceled", cancel_reason: parsed.data.cancel_reason })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return notAllowed;
  revalidateSchedule();
  return success("Sessão cancelada.");
}

const decideSchema = z.object({
  request_id: z.string().guid(),
  decision: z.enum(["approve", "reject"]),
  note: optionalText,
});

export async function decideReschedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = decideSchema.safeParse(form(formData));
  if (!parsed.success) return failure("Dados inválidos.");
  const approve = parsed.data.decision === "approve";

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_reschedule", {
    target_request: parsed.data.request_id,
    approve,
    note: parsed.data.note ?? undefined,
  });
  if (error) return fromDb(error);
  revalidateSchedule();
  return success(approve ? "Remarcação aprovada." : "Remarcação recusada.");
}
