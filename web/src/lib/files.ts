import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xml",
  "text/xml",
];
export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xml";

export function safeFileName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "arquivo";
}

export type UploadResult = { ok: true; path: string; size: number; mimeType: string } | { ok: false; message: string };

// Uploads into the private "files" bucket under the uploader's own folder, as
// the signed-in user (storage RLS only allows writing to <uid>/...).
export async function uploadUserFile(userId: string, file: File | null): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, message: "Selecione um arquivo." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "Arquivo maior que 20 MB." };
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return { ok: false, message: "Tipo de arquivo não permitido. Use PDF, imagem, Word ou XML." };

  const path = `${userId}/${randomUUID()}-${safeFileName(file.name)}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("files").upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[storage]", error);
    return { ok: false, message: "Falha ao enviar o arquivo." };
  }
  return { ok: true, path, size: file.size, mimeType: file.type };
}

export async function removeUserFile(path: string) {
  const supabase = await createClient();
  await supabase.storage.from("files").remove([path]);
}
