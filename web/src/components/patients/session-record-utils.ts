// Pure helpers for session records (no server/client imports, so they are unit-testable).

export type FamilyConfirmation = "confirmed" | "disputed" | null;

type Tone = "green" | "yellow" | "red";

// Only completed sessions wait for the family's "de acordo".
export function familyConfirmationMeta(
  status: string,
  confirmation: string | null,
  note: string | null,
): { label: string; tone: Tone } | null {
  if (status !== "completed") return null;
  if (confirmation === "confirmed") return { label: "Confirmada pela família", tone: "green" };
  if (confirmation === "disputed") return { label: `Contestada${note ? `: ${note}` : ""}`, tone: "red" };
  return { label: "Aguardando de acordo", tone: "yellow" };
}

export type AttachmentKind = "image" | "video" | "pdf" | "file";

// HEIC is not rendered by most browsers, so it is offered as a link.
export function attachmentKind(mimeType: string | null): AttachmentKind {
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  return "file";
}

export function fileHref(path: string, download = false): string {
  return `/files?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

export const SESSION_MEDIA_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.pdf";

// A record can be written by the session's own therapist once the session started.
export function canRegisterSession(
  session: { therapistId: string; status: string; startsAt: string; hasRecord: boolean },
  userId: string,
  now: Date,
): boolean {
  return (
    session.therapistId === userId &&
    !session.hasRecord &&
    ["scheduled", "confirmed", "completed"].includes(session.status) &&
    new Date(session.startsAt).getTime() <= now.getTime()
  );
}
