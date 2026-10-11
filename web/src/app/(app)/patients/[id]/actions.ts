"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/format";
import { type ActionState, failure, fromDb, fromZod, success } from "@/lib/action-state";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

function refresh(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
}

// ---------------------------------------------------------------------------
// Care assignments (admin + coordination)
// ---------------------------------------------------------------------------
const addAssignmentSchema = z.object({
  patient_id: z.string().guid(),
  therapist_id: z.string().guid("Selecione o terapeuta."),
  therapy_id: z.string().guid("Selecione a terapia."),
  frequency: optionalText(80),
  starts_on: isoDate,
});

export async function addCareAssignment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const parsed = addAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("care_assignments").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return failure("Este terapeuta já tem vínculo aberto com o paciente nesta terapia.");
    return fromDb(error);
  }
  refresh(parsed.data.patient_id);
  return success("Vínculo criado.");
}

const endAssignmentSchema = z.object({
  id: z.string().guid(),
  patient_id: z.string().guid(),
  ends_on: isoDate,
});

export async function endCareAssignment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const parsed = endAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_assignments")
    .update({ ends_on: parsed.data.ends_on })
    .eq("id", parsed.data.id)
    .eq("patient_id", parsed.data.patient_id)
    .is("ends_on", null)
    .select("id");
  if (error) {
    if (error.code === "23514") return failure("A data de término não pode ser anterior ao início do vínculo.");
    return fromDb(error);
  }
  if (!data?.length) return failure("Vínculo não encontrado ou já encerrado.");
  refresh(parsed.data.patient_id);
  return success("Vínculo encerrado.");
}

// ---------------------------------------------------------------------------
// Session notes (therapists linked to the patient; RLS enforces it)
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  id: z.union([z.string().guid(), z.literal("")]).optional(),
  patient_id: z.string().guid(),
  session_date: isoDate,
  appointment_id: z.union([z.string().guid(), z.literal("")]).optional(),
  content: z.string().trim().min(3, "Escreva a evolução.").max(20000),
});

export async function saveSessionNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["therapist"]);
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, patient_id, session_date, content } = parsed.data;
  const appointmentId = parsed.data.appointment_id || null;

  const supabase = await createClient();

  // The note may only point to a completed session of this therapist with this patient.
  if (appointmentId) {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", appointmentId)
      .eq("patient_id", patient_id)
      .eq("therapist_id", user.id)
      .eq("status", "completed")
      .maybeSingle();
    if (!appointment) return failure("Selecione uma sessão concluída sua com este paciente.");
  }

  if (id) {
    const { data, error } = await supabase
      .from("session_notes")
      .update({ content, session_date, appointment_id: appointmentId })
      .eq("id", id)
      .eq("therapist_id", user.id)
      .select("id");
    if (error) return noteError(error);
    if (!data?.length) return failure("Você só pode editar as próprias evoluções.");
  } else {
    const { error } = await supabase
      .from("session_notes")
      .insert({ patient_id, therapist_id: user.id, session_date, content, appointment_id: appointmentId });
    if (error) return noteError(error);
  }

  refresh(patient_id);
  return success(id ? "Evolução atualizada." : "Evolução registrada.");
}

function noteError(error: { message: string; code?: string }) {
  if (error.code === "23505") return failure("Esta sessão já tem uma evolução registrada.");
  return fromDb(error);
}

// ---------------------------------------------------------------------------
// Treatment plans (therapist linked; one plan per therapist × therapy)
// ---------------------------------------------------------------------------
const planSchema = z.object({
  id: z.union([z.string().guid(), z.literal("")]).optional(),
  patient_id: z.string().guid(),
  therapy_id: z.string().guid(),
  intent: z.enum(["draft", "publish"]),
  frequency: optionalText(80),
  session_minutes: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(10).max(480)]),
  care_type: optionalText(80),
  estimated_duration: optionalText(80),
  chief_complaint: optionalText(1000),
  goals: optionalText(10000),
  strategies: optionalText(10000),
  home_guidance: optionalText(10000),
  materials: optionalText(2000),
  important_notes: optionalText(10000),
});

export async function saveTreatmentPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["therapist"]);
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, intent, patient_id, therapy_id, ...fields } = parsed.data;
  const values = { ...fields, is_draft: intent === "draft" };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase
      .from("treatment_plans")
      .update(values)
      .eq("id", id)
      .eq("therapist_id", user.id)
      .select("id");
    if (error) return fromDb(error);
    if (!data?.length) return failure("Você só pode editar os próprios planos.");
  } else {
    const today = localDateKey(new Date());
    const { data: assignment } = await supabase
      .from("care_assignments")
      .select("id")
      .eq("patient_id", patient_id)
      .eq("therapist_id", user.id)
      .eq("therapy_id", therapy_id)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .limit(1)
      .maybeSingle();
    if (!assignment) return failure("Você não tem vínculo ativo com este paciente nesta terapia.");

    const { error } = await supabase
      .from("treatment_plans")
      .insert({ ...values, patient_id, therapy_id, therapist_id: user.id });
    if (error) return fromDb(error);
  }

  refresh(patient_id);
  return success(intent === "draft" ? "Rascunho salvo." : "Plano publicado. Orientações e materiais já estão visíveis para a família.");
}
