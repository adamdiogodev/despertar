import type { Database } from "@/lib/database.types";

export type DocumentCategory = Database["public"]["Enums"]["document_category"];
export type DocumentStatus = Database["public"]["Enums"]["document_status"];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Contrato",
  anamnesis: "Anamnese",
  report: "Relatório",
  medical: "Laudo / médico",
  treatment_plan: "Plano de atendimento",
  administrative: "Administrativo",
  other: "Outro",
};

export const DOCUMENT_CATEGORY_ICONS: Record<DocumentCategory, string> = {
  contract: "📄",
  anamnesis: "📋",
  report: "📑",
  medical: "🩺",
  treatment_plan: "🎯",
  administrative: "🗂",
  other: "📁",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  received: "Recebido",
  under_review: "Em análise",
  available: "Disponível",
};

export function isDocumentCategory(value: string | undefined): value is DocumentCategory {
  return !!value && Object.hasOwn(DOCUMENT_CATEGORY_LABELS, value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
