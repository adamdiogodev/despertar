"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/format";
import { type ActionState, failure, fromDb, fromZod, success } from "@/lib/action-state";
import { removeUserFile, resolveUploads } from "@/lib/files";

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
// Session records (therapists linked to the patient; RLS enforces it). Shared
// with the family; registering a started session marks it as completed.
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  id: z.union([z.string().guid(), z.literal("")]).optional(),
  patient_id: z.string().guid(),
  session_date: isoDate,
  appointment_id: z.union([z.string().guid(), z.literal("")]).optional(),
  content: z.string().trim().min(3, "Escreva o registro da sessão.").max(20000),
});

export async function saveSessionNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["therapist"]);
  const parsed = noteSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([key]) => key !== "attachments")));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, patient_id, session_date, content } = parsed.data;
  const appointmentId = parsed.data.appointment_id || null;
  // Attachments were uploaded by the browser; resolve and validate them here.
  const uploads = await resolveUploads(user.id, formData, "attachments");

  const supabase = await createClient();

  // Own session of this patient that already started (the database re-checks it).
  if (appointmentId) {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", appointmentId)
      .eq("patient_id", patient_id)
      .eq("therapist_id", user.id)
      .in("status", ["scheduled", "confirmed", "completed"])
      .lte("starts_at", new Date().toISOString())
      .maybeSingle();
    if (!appointment) return failure("Selecione uma sessão sua com este paciente que já começou.");
  }

  let noteId = id || null;
  if (noteId) {
    const { data, error } = await supabase
      .from("session_notes")
      .update({ content, session_date, appointment_id: appointmentId })
      .eq("id", noteId)
      .eq("therapist_id", user.id)
      .select("id");
    if (error) return noteError(error);
    if (!data?.length) return failure("Você só pode editar os próprios registros.");
  } else {
    const { data, error } = await supabase
      .from("session_notes")
      .insert({ patient_id, therapist_id: user.id, session_date, content, appointment_id: appointmentId })
      .select("id")
      .single();
    if (error) return noteError(error);
    noteId = data.id;
  }

  const failed: string[] = [];
  for (const upload of uploads) {
    if (!upload.ok) {
      failed.push(upload.message);
      continue;
    }
    const { error } = await supabase.from("session_attachments").insert({
      session_note_id: noteId,
      file_path: upload.path,
      file_name: upload.name,
      mime_type: upload.mimeType,
      size_bytes: upload.size,
      uploaded_by: user.id,
    });
    if (error) {
      await removeUserFile(upload.path);
      failed.push(`${upload.name} (${fromDb(error).message})`);
    }
  }

  refresh(patient_id);
  revalidatePath("/schedule");
  revalidatePath("/portal/sessions");
  revalidatePath("/portal");
  const saved = id ? "Registro atualizado." : appointmentId ? "Sessão registrada e concluída. A família foi avisada." : "Registro salvo.";
  // The record itself is saved, so the form resets; the message lists what to resend.
  return success(failed.length ? `${saved} Anexos não enviados: ${failed.join("; ")}` : saved);
}

function noteError(error: { message: string; code?: string }) {
  if (error.code === "23505") return failure("Esta sessão já tem um registro.");
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
