import { attachmentKind, fileHref } from "./session-record-utils";

export type SessionAttachment = { id: string; file_path: string; file_name: string; mime_type: string | null };

export const SESSION_RECORD_SELECT = "id, appointment_id, content, session_date, therapist_id, session_attachments (id, file_path, file_name, mime_type)";

// Text of the session record plus a thumbnail gallery; videos and PDFs open as links.
export function SessionRecordView({ content, attachments }: { content: string; attachments: SessionAttachment[] }) {
  const images = attachments.filter((item) => attachmentKind(item.mime_type) === "image");
  const others = attachments.filter((item) => attachmentKind(item.mime_type) !== "image");
  return (
    <div data-testid="session-record">
      <p className="whitespace-pre-wrap rounded-lg bg-page px-4 py-3 text-sm leading-relaxed text-t1">{content}</p>
      {images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="session-gallery">
          {images.map((image) => (
            <a key={image.id} href={fileHref(image.file_path)} target="_blank" rel="noopener noreferrer" title={image.file_name}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL behind a redirect */}
              <img
                src={fileHref(image.file_path)}
                alt={image.file_name}
                loading="lazy"
                className="h-24 w-24 rounded-lg border border-line object-cover transition hover:brightness-90"
              />
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {others.map((item) => (
            <li key={item.id}>
              <a href={fileHref(item.file_path)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">
                {attachmentKind(item.mime_type) === "video" ? "🎬" : "📄"} {item.file_name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
