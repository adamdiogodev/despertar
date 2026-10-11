import type { Database } from "@/lib/database.types";

export type RecordStatus = Database["public"]["Enums"]["record_status"];

export const PAGE_SIZE = 20;

export const STATUS_META: Record<RecordStatus, { label: string; tone: "green" | "yellow" | "gray" }> = {
  active: { label: "Ativo", tone: "green" },
  pending: { label: "Pendente", tone: "yellow" },
  inactive: { label: "Inativo", tone: "gray" },
};

export const RECORD_STATUSES = Object.keys(STATUS_META) as RecordStatus[];

export function isRecordStatus(value: unknown): value is RecordStatus {
  return typeof value === "string" && (RECORD_STATUSES as string[]).includes(value);
}

// Mirrors public.is_assignment_active: dates are local YYYY-MM-DD strings.
export function isAssignmentActive(startsOn: string, endsOn: string | null, today: string): boolean {
  return startsOn <= today && (endsOn === null || endsOn >= today);
}

export type ListParams = { q?: string; therapy?: string; status?: string; page?: number };

// Builds the /patients URL keeping the current filters; empty values are dropped.
export function patientsListHref(current: ListParams, overrides: ListParams = {}): string {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.therapy) params.set("therapy", merged.therapy);
  if (merged.status) params.set("status", merged.status);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `/patients?${query}` : "/patients";
}

export function parsePage(value: unknown): number {
  const page = Number(typeof value === "string" ? value : 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// Escapes LIKE wildcards so a search for "50%" matches literally.
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
