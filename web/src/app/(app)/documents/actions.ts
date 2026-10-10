"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, MANAGER_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { removeUserFile, uploadUserFile } from "@/lib/files";

const uploadSchema = z.object({
  title: z.string().trim().min(2, "Informe o título.").max(160),
  category: z.enum(["contract", "anamnesis", "report", "medical", "treatment_plan", "administrative", "other"], { message: "Selecione a categoria." }),
  // "family:<uuid>" | "patient:<uuid>" | "" (internal clinic document)
  target: z.string().regex(/^((family|patient):[0-9a-f-]{36})?$/i, "Destino inválido."),
  visibleToFamily: z.boolean(),
});

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const parsed = uploadSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    target: formData.get("target") ?? "",
    visibleToFamily: formData.get("visibleToFamily") === "on",
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { title, category, target, visibleToFamily } = parsed.data;
  const [kind, targetId] = target ? target.split(":") : [null, null];

  if (user.role === "therapist" && !target) {
    return failure("Selecione a família ou o paciente.", { target: ["Selecione a família ou o paciente."] });
  }
  if (visibleToFamily && !target) {
    return failure("Para ficar visível à família, selecione a família ou o paciente.", { target: ["Obrigatório quando visível à família."] });
  }

  const supabase = await createClient();
  // The selected family/patient must be visible to this user (RLS decides).
  if (kind === "family") {
    const { data } = await supabase.from("families").select("id").eq("id", targetId!).maybeSingle();
    if (!data) return failure("Família não encontrada.");
  } else if (kind === "patient") {
    const { data } = await supabase.from("patients").select("id").eq("id", targetId!).maybeSingle();
    if (!data) return failure("Paciente não encontrado.");
  }

  const file = formData.get("file");
  const upload = await uploadUserFile(user.id, file instanceof File ? file : null);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const { error } = await supabase.from("documents").insert({
    title,
    category,
    file_path: upload.path,
    mime_type: upload.mimeType,
    size_bytes: upload.size,
    family_id: kind === "family" ? targetId : null,
    patient_id: kind === "patient" ? targetId : null,
    therapist_id: user.role === "therapist" ? user.id : null,
    visible_to_family: visibleToFamily,
    uploaded_by: user.id,
  });
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  revalidatePath("/documents");
  return success("Documento enviado.");
}

const idSchema = z.string().guid();

// Only the uploader deletes (the file lives in their storage folder).
export async function deleteDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const id = idSchema.safeParse(formData.get("documentId"));
  if (!id.success) return failure("Documento inválido.");

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, file_path, uploaded_by").eq("id", id.data).maybeSingle();
  if (!doc || doc.uploaded_by !== user.id) return failure("Você só pode excluir documentos enviados por você.");

  const { data, error } = await supabase.from("documents").delete().eq("id", doc.id).select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Documento não encontrado.");
  await removeUserFile(doc.file_path);
  revalidatePath("/documents");
  return success("Documento excluído.");
}

// Documents sent by families arrive "under_review"; a manager releases them.
export async function releaseDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const id = idSchema.safeParse(formData.get("documentId"));
  if (!id.success) return failure("Documento inválido.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ status: "available" })
    .eq("id", id.data)
    .eq("status", "under_review")
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Documento não está em análise.");
  revalidatePath("/documents");
  return success("Documento marcado como disponível.");
}
