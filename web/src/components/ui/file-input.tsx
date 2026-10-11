"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, buildUploadPath } from "@/lib/upload-rules";
import { cn } from "./primitives";

type Uploaded = { path: string; name: string };

// Uploads straight from the browser to the private "files" bucket (storage RLS
// only allows the user's own folder), so files never pass through the server —
// Vercel caps request bodies at 4.5 MB. The form receives one hidden input per
// file named `name`, holding JSON {path, name}; the server action resolves it
// with resolveUploads(), which re-checks ownership, size and type.
export function FileInput({
  name,
  accept,
  multiple = false,
  required = false,
}: {
  name: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleChange(list: FileList | null) {
    const selected = [...(list ?? [])];
    if (!selected.length) return;
    const invalid = selected.find((file) => file.size > MAX_FILE_BYTES || !ALLOWED_MIME_TYPES.includes(file.type));
    if (invalid) {
      setStatus("error");
      setMessage(invalid.size > MAX_FILE_BYTES ? `${invalid.name}: maior que 20 MB.` : `${invalid.name}: tipo de arquivo não permitido.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setStatus("uploading");
    setMessage(`Enviando ${selected.length} arquivo(s)...`);
    inputRef.current?.setCustomValidity("Aguarde o envio do arquivo terminar.");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("error");
      setMessage("Sessão expirada. Entre novamente.");
      inputRef.current?.setCustomValidity("");
      return;
    }
    const uploaded: Uploaded[] = [];
    for (const file of selected) {
      const path = buildUploadPath(user.id, file.name, crypto.randomUUID());
      const { error } = await supabase.storage.from("files").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setStatus("error");
        setMessage(`Falha ao enviar ${file.name}. Tente novamente.`);
        inputRef.current?.setCustomValidity("");
        return;
      }
      uploaded.push({ path, name: file.name });
    }
    setFiles((current) => (multiple ? [...current, ...uploaded] : uploaded));
    setStatus("idle");
    setMessage("");
    inputRef.current?.setCustomValidity("");
  }

  return (
    <div>
      <input
        ref={inputRef}
        id={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required && files.length === 0}
        disabled={status === "uploading"}
        onChange={(event) => handleChange(event.target.files)}
        className="w-full rounded-lg border-[1.5px] border-line bg-white px-3 py-2 text-sm text-t1 file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary"
      />
      {files.map((file) => (
        <input key={file.path} type="hidden" name={name} value={JSON.stringify(file)} />
      ))}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file) => (
            <li key={file.path} className="flex items-center justify-between gap-2 rounded-md bg-ok-bg px-2.5 py-1.5 text-xs text-ok">
              <span className="truncate">✓ {file.name}</span>
              <button
                type="button"
                className="shrink-0 font-semibold text-t3 hover:text-danger"
                onClick={() => setFiles((current) => current.filter((item) => item.path !== file.path))}
              >
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className={cn("mt-1 text-[11px] font-medium", status === "error" ? "text-danger" : "text-t2")}>{message}</p>}
    </div>
  );
}
