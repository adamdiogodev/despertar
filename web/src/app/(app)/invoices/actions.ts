"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, type AppRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { removeUserFile, uploadUserFile } from "@/lib/files";

// Any team member who can be a payee (session NFs for therapists, ad hoc ones for the staff).
const PAYEE_ROLES: AppRole[] = ["coordination", "reception", "therapist"];
const INVOICE_MIME_TYPES = ["application/pdf", "application/xml", "text/xml"];

const submitSchema = z.object({
  id: z.string().guid(),
  number: z.string().trim().min(1, "Informe o número da NF.").max(40),
});

export async function submitInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(PAYEE_ROLES);
  const parsed = submitSchema.safeParse({ id: formData.get("id"), number: formData.get("number") });
  if (!parsed.success) return fromZod(parsed.error);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("Verifique os campos destacados.", { file: ["Anexe o PDF ou XML da nota."] });
  if (!INVOICE_MIME_TYPES.includes(file.type)) return failure("Verifique os campos destacados.", { file: ["Envie a nota em PDF ou XML."] });

  const upload = await uploadUserFile(user.id, file);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_invoice", {
    target_request: parsed.data.id,
    number: parsed.data.number,
    file_path: upload.path,
  });
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  revalidatePath("/invoices");
  revalidatePath("/finance", "layout");
  return success("Nota fiscal enviada para conferência.");
}
