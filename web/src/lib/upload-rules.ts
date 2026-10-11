// Upload rules shared by the browser uploader and the server-side checks.
// The storage bucket enforces the same size and type limits.

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xml",
  "text/xml",
];

export function safeFileName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "arquivo";
}

export function buildUploadPath(userId: string, fileName: string, unique: string) {
  return `${userId}/${unique}-${safeFileName(fileName)}`;
}

export type UploadReference = { path: string; name: string };

// Parses the hidden-field JSON produced by <FileInput>. Only paths inside the
// caller's own folder are accepted.
export function parseUploadReference(value: unknown, userId: string): UploadReference | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<UploadReference>;
    if (typeof parsed.path !== "string" || typeof parsed.name !== "string") return null;
    if (!parsed.path.startsWith(`${userId}/`) || parsed.path.includes("..")) return null;
    return { path: parsed.path, name: parsed.name.slice(0, 200) };
  } catch {
    return null;
  }
}
