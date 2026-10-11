import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
type Tone = "green" | "yellow" | "red" | "blue" | "purple" | "gray";

export const RECORD_STATUS: Record<Enums["record_status"], { label: string; tone: Tone }> = {
  active: { label: "Ativa", tone: "green" },
  pending: { label: "Aguardando", tone: "yellow" },
  inactive: { label: "Inativa", tone: "gray" },
};

export const REQUEST_TYPE_LABELS: Record<Enums["guardian_request_type"], string> = {
  information: "Informação",
  reschedule: "Remarcação",
  billing: "Financeiro",
  document: "Documento",
  data_update: "Atualização de dados",
  other: "Outro",
};

export const REQUEST_STATUS: Record<Enums["guardian_request_status"], { label: string; tone: Tone }> = {
  open: { label: "Aberta", tone: "yellow" },
  answered: { label: "Respondida", tone: "blue" },
  closed: { label: "Encerrada", tone: "gray" },
};

export const PAY_MODEL_LABELS: Record<Enums["pay_model"], string> = {
  per_session: "Por sessão",
  per_hour: "Por hora",
};

export const ROLE_TONES: Record<Enums["app_role"], Tone> = {
  admin: "purple",
  coordination: "yellow",
  reception: "blue",
  therapist: "green",
  guardian: "gray",
};

// Reports still owed by the therapist (not yet delivered, or sent back for changes).
export const OPEN_REPORT_STATUSES = ["pending", "returned"] as const;

export const REPORT_TYPE_LABELS: Record<Enums["report_type"], string> = {
  evaluation: "Avaliação",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  school: "Escolar",
  other: "Outro",
};

// For ilike filters: user input must not act as a wildcard.
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
