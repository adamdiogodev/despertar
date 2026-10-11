import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, parseUploadReference } from "@/lib/upload-rules";

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xml";

export type UploadResult =
  | { ok: true; path: string; name: string; size: number; mimeType: string }
  | { ok: false; message: string };

// Files are uploaded by the browser (<FileInput>) straight to storage. Here we
// only trust what storage itself reports about the object: it must exist in the
// caller's folder, and its real size/type must be within the rules.
async function resolveReference(userId: string, value: FormDataEntryValue | null): Promise<UploadResult> {
  const reference = parseUploadReference(value, userId);
  if (!reference) return { ok: false, message: "Selecione um arquivo." };

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("files").info(reference.path);
  if (error || !data) return { ok: false, message: "Arquivo não encontrado. Envie novamente." };

  const size = data.size ?? 0;
  const mimeType = data.contentType ?? "";
  if (size > MAX_FILE_BYTES || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    await removeUserFile(reference.path);
    return { ok: false, message: "Arquivo inválido (tamanho ou tipo)." };
  }
  return { ok: true, path: reference.path, name: reference.name, size, mimeType };
}

export async function resolveUpload(userId: string, formData: FormData, field = "file"): Promise<UploadResult> {
  return resolveReference(userId, formData.get(field));
}

export async function resolveUploads(userId: string, formData: FormData, field: string): Promise<UploadResult[]> {
  return Promise.all(formData.getAll(field).map((value) => resolveReference(userId, value)));
}

export async function removeUserFile(path: string) {
  const supabase = await createClient();
  await supabase.storage.from("files").remove([path]);
}
