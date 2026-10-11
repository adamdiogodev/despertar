// Pure rules for the family portal (no server/client imports, so they are unit-testable).

// Mirrors the database rule in request_reschedule / guardian_cancel_appointment:
// a guardian may only change a session that starts at least `minHours` from now.
// The database re-checks it; this only decides whether to show the form or the
// "contact the clinic" notice.
export function canRequestChange(now: Date, startsAt: Date | string, minHours: number): boolean {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  return start.getTime() - now.getTime() >= minHours * 60 * 60 * 1000;
}

export const PASSWORD_RULE_TEXT = "Mínimo de 10 caracteres, com letra maiúscula, letra minúscula e número.";

// Returns the first problem with the new password, or null when it is acceptable.
export function validatePassword(password: string, confirmation: string): string | null {
  if (password.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula.";
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula.";
  if (!/\d/.test(password)) return "Inclua pelo menos um número.";
  if (password !== confirmation) return "A confirmação não confere com a nova senha.";
  return null;
}

export type ChargeStatus = "pending" | "paid" | "awaiting_insurance" | "canceled";
export type ChargeDisplay = "paid" | "pending" | "overdue" | "awaiting_insurance" | "canceled";

// `today` is the clinic's local date (YYYY-MM-DD); due dates are plain dates.
export function chargeDisplayStatus(status: ChargeStatus, dueDate: string, today: string): ChargeDisplay {
  if (status === "pending" && dueDate < today) return "overdue";
  return status;
}

export type FinanceSituation = "up_to_date" | "pending" | "overdue";

export function financeSituation(charges: { status: ChargeStatus; due_date: string }[], today: string): FinanceSituation {
  const displays = charges.map((charge) => chargeDisplayStatus(charge.status, charge.due_date, today));
  if (displays.includes("overdue")) return "overdue";
  if (displays.includes("pending")) return "pending";
  return "up_to_date";
}

// Keeps the selected child (?child=) on links between portal pages.
export function withChild(href: string, childId: string | null | undefined): string {
  if (!childId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}child=${encodeURIComponent(childId)}`;
}
