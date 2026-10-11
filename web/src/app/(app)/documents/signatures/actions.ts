"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, MANAGER_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";

const idSchema = z.string().guid();

export async function signDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin", "coordination", "therapist"]);
  const id = idSchema.safeParse(formData.get("requestId"));
  if (!id.success) return failure("Solicitação inválida.");

  // Audit trail captured server-side; the client cannot forge it via the form.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  const userAgent = h.get("user-agent") ?? "desconhecido";

  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_document", { target_request: id.data, client_ip: ip, client_user_agent: userAgent });
  if (error) return fromDb(error);
  revalidatePath("/documents/signatures");
  return success("Documento assinado.");
}

const requestSchema = z.object({
  documentId: z.string().guid("Selecione o documento."),
  signerId: z.string().guid("Selecione o signatário."),
  dueDate: z.iso.date("Data inválida.").optional().or(z.literal("").transform(() => undefined)),
});

export async function requestSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(MANAGER_ROLES);
  const parsed = requestSchema.safeParse({
    documentId: formData.get("documentId"),
    signerId: formData.get("signerId"),
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { documentId, signerId, dueDate } = parsed.data;

  const supabase = await createClient();
  const [{ data: doc }, { data: signer }] = await Promise.all([
    supabase.from("documents").select("id, family_id").eq("id", documentId).maybeSingle(),
    supabase.from("profiles").select("id, role, active").eq("id", signerId).maybeSingle(),
  ]);
  if (!doc) return failure("Documento não encontrado.");
  if (!signer?.active) return failure("Signatário não encontrado.");

  // Signers: guardians of the document's family, or therapists.
  if (signer.role === "guardian") {
    const { data: link } = doc.family_id
      ? await supabase.from("guardians").select("profile_id").eq("profile_id", signerId).eq("family_id", doc.family_id).maybeSingle()
      : { data: null };
    if (!link) return failure("O responsável precisa ser da família do documento.");
  } else if (signer.role !== "therapist") {
    return failure("O signatário deve ser um responsável da família ou um terapeuta.");
  }

  const { error } = await supabase.from("signature_requests").insert({
    document_id: documentId,
    signer_id: signerId,
    requested_by: user.id,
    due_date: dueDate ?? null,
  });
  if (error?.code === "23505") return failure("Já existe uma solicitação deste documento para este signatário.");
  if (error) return fromDb(error);
  revalidatePath("/documents/signatures");
  revalidatePath("/documents");
  return success("Assinatura solicitada. O signatário foi notificado.");
}

export async function cancelSignatureRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(MANAGER_ROLES);
  const id = idSchema.safeParse(formData.get("requestId"));
  if (!id.success) return failure("Solicitação inválida.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signature_requests")
    .update({ status: "canceled" })
    .eq("id", id.data)
    .eq("status", "pending")
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return failure("Solicitação não está mais pendente.");
  revalidatePath("/documents/signatures");
  revalidatePath("/documents");
  return success("Solicitação cancelada.");
}
