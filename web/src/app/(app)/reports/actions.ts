"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, MANAGER_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { removeUserFile, resolveUpload } from "@/lib/files";
import { localDateKey } from "@/lib/format";

function refreshReports() {
  revalidatePath("/reports");
  revalidatePath("/patients/[id]", "page");
}

const createSchema = z.object({
  patientId: z.string().guid("Selecione o paciente."),
  therapistId: z.string().guid("Selecione o terapeuta.").optional(),
  reportType: z.enum(["evaluation", "quarterly", "semiannual", "school", "other"], { message: "Selecione o tipo." }),
  referenceLabel: z.string().trim().min(2, "Informe a referência.").max(80),
  dueDate: z.iso.date("Data inválida.").optional().or(z.literal("").transform(() => undefined)),
});

// Managers request a report from a therapist; therapists may open one for themselves.
export async function createReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const parsed = createSchema.safeParse({
    patientId: formData.get("patientId"),
    therapistId: user.role === "therapist" ? user.id : formData.get("therapistId") || undefined,
    reportType: formData.get("reportType"),
    referenceLabel: formData.get("referenceLabel"),
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { patientId, therapistId, reportType, referenceLabel, dueDate } = parsed.data;
  if (!therapistId) return failure("Selecione o terapeuta.", { therapistId: ["Selecione o terapeuta."] });

  const supabase = await createClient();
  const today = localDateKey(new Date());
  const { data: link } = await supabase
    .from("care_assignments")
    .select("id")
    .eq("patient_id", patientId)
    .eq("therapist_id", therapistId)
    .lte("starts_on", today)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .limit(1)
    .maybeSingle();
  if (!link) return failure("O terapeuta não tem vínculo vigente com este paciente.");

  const { error } = await supabase.from("reports").insert({
    patient_id: patientId,
    therapist_id: therapistId,
    report_type: reportType,
    reference_label: referenceLabel,
    due_date: dueDate ?? null,
  });
  if (error) return fromDb(error);
  refreshReports();
  return success(user.role === "therapist" ? "Relatório criado." : "Relatório solicitado. O terapeuta foi notificado.");
}

const idSchema = z.string().guid();

// Therapist attaches the file and sends the report to coordination.
export async function submitReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["therapist"]);
  const id = idSchema.safeParse(formData.get("reportId"));
  if (!id.success) return failure("Relatório inválido.");

  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, status, file_path, therapist_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!report || report.therapist_id !== user.id) return failure("Relatório não encontrado.");
  if (report.status !== "pending" && report.status !== "returned") return failure("Este relatório já foi enviado.");

  const upload = await resolveUpload(user.id, formData);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const { error } = await supabase.from("reports").update({ file_path: upload.path, status: "in_review" }).eq("id", report.id);
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  // The previous version (after a return) is replaced by the new upload.
  if (report.file_path && report.file_path.startsWith(`${user.id}/`)) await removeUserFile(report.file_path);
  refreshReports();
  return success("Relatório enviado para revisão.");
}

export async function approveReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const id = idSchema.safeParse(formData.get("reportId"));
  if (!id.success) return failure("Relatório inválido.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").update({ status: "approved" }).eq("id", id.data).select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Relatório não encontrado.");
  refreshReports();
  return success("Relatório aprovado. A família foi notificada.");
}

const returnSchema = z.object({
  reportId: z.string().guid(),
  reason: z.string().trim().min(5, "Descreva o motivo da devolução.").max(1000),
});

export async function returnReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const parsed = returnSchema.safeParse({ reportId: formData.get("reportId"), reason: formData.get("reason") });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .update({ status: "returned", return_reason: parsed.data.reason })
    .eq("id", parsed.data.reportId)
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Relatório não encontrado.");
  refreshReports();
  return success("Relatório devolvido. O terapeuta foi notificado.");
}

const uploadSchema = createSchema.omit({ dueDate: true });

// Creates the report already with its file and sends it to review in one step.
// Linked therapists upload their own; managers may upload on behalf of one.
export async function uploadReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const parsed = uploadSchema.safeParse({
    patientId: formData.get("patientId"),
    therapistId: user.role === "therapist" ? user.id : formData.get("therapistId") || undefined,
    reportType: formData.get("reportType"),
    referenceLabel: formData.get("referenceLabel"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { patientId, therapistId, reportType, referenceLabel } = parsed.data;
  if (!therapistId) return failure("Selecione o terapeuta.", { therapistId: ["Selecione o terapeuta."] });

  const supabase = await createClient();
  const today = localDateKey(new Date());
  const { data: link } = await supabase
    .from("care_assignments")
    .select("id")
    .eq("patient_id", patientId)
    .eq("therapist_id", therapistId)
    .lte("starts_on", today)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .limit(1)
    .maybeSingle();
  if (!link) return failure("O terapeuta não tem vínculo vigente com este paciente.");

  const upload = await resolveUpload(user.id, formData);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const { data: report, error } = await supabase
    .from("reports")
    .insert({ patient_id: patientId, therapist_id: therapistId, report_type: reportType, reference_label: referenceLabel, file_path: upload.path })
    .select("id")
    .single();
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  const { error: submitError } = await supabase.from("reports").update({ status: "in_review" }).eq("id", report.id);
  refreshReports();
  if (submitError) return failure(`Relatório criado com o arquivo, mas não foi enviado para revisão: ${fromDb(submitError).message}`);
  return success("Relatório enviado para revisão da coordenação.");
}
