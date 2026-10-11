"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { removeUserFile, resolveUpload } from "@/lib/files";

const signSchema = z.object({
  requestId: z.string().guid(),
  agree: z.literal("on", { message: "Confirme que leu o documento." }),
});

export async function signDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["guardian"]);
  const parsed = signSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  // Evidence of the electronic acceptance, stored with the signature.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  const userAgent = h.get("user-agent") ?? "desconhecido";

  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_document", {
    target_request: parsed.data.requestId,
    client_ip: ip,
    client_user_agent: userAgent,
  });
  if (error) return fromDb(error);
  revalidatePath("/portal/documents");
  revalidatePath("/portal");
  return success("Documento assinado. Obrigado!");
}

const uploadSchema = z.object({
  title: z.string().trim().min(3, "Dê um nome ao documento.").max(150),
  category: z.enum(["medical", "other"], { message: "Escolha o tipo." }),
  patientId: z.string().guid("Escolha a criança."),
});

export async function uploadFamilyDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["guardian"]);
  const parsed = uploadSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    patientId: formData.get("patientId"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  // RLS only returns the guardian's own children, so this also validates the id.
  const { data: patient } = await supabase.from("patients").select("id, family_id").eq("id", parsed.data.patientId).maybeSingle();
  if (!patient) return failure("Criança não encontrada.", { patientId: ["Escolha a criança."] });

  const upload = await resolveUpload(user.id, formData);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const { error } = await supabase.from("documents").insert({
    title: parsed.data.title,
    category: parsed.data.category,
    file_path: upload.path,
    mime_type: upload.mimeType,
    size_bytes: upload.size,
    family_id: patient.family_id,
    patient_id: patient.id,
    visible_to_family: true,
    uploaded_by: user.id,
  });
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  revalidatePath("/portal/documents");
  return success("Documento enviado! A equipe da clínica vai analisar.");
}
