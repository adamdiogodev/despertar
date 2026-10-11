import type { Database } from "@/lib/database.types";
import { formatCents } from "@/lib/format";

type Enums = Database["public"]["Enums"];
export type ChargeStatus = Enums["charge_status"];
export type InvoiceStatus = Enums["invoice_status"];
export type PayModel = Enums["pay_model"];
export type AppointmentStatus = Enums["appointment_status"];
type Tone = "green" | "yellow" | "red" | "blue" | "purple" | "gray";

export const PAYMENT_METHODS = ["Pix", "Boleto", "Cartão", "Convênio", "Transferência"] as const;

// "overdue" is not stored: it is a pending charge whose due date has passed.
export type ChargeDisplayStatus = ChargeStatus | "overdue";

export const CHARGE_STATUS_META: Record<ChargeDisplayStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "yellow" },
  overdue: { label: "Atrasado", tone: "red" },
  paid: { label: "Pago", tone: "green" },
  awaiting_insurance: { label: "Aguard. convênio", tone: "blue" },
  canceled: { label: "Cancelado", tone: "gray" },
};

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  requested: { label: "Aguardando NF", tone: "yellow" },
  submitted: { label: "NF enviada", tone: "blue" },
  approved: { label: "Aprovada", tone: "purple" },
  rejected: { label: "Recusada", tone: "red" },
  paid: { label: "Paga", tone: "green" },
};

export const PAY_MODEL_LABELS: Record<PayModel, string> = { per_session: "Por sessão", per_hour: "Por hora" };

export function chargeDisplayStatus(status: ChargeStatus, dueDate: string, today: string): ChargeDisplayStatus {
  return status === "pending" && dueDate < today ? "overdue" : status;
}

// "2026-10" → first and last day of that month (YYYY-MM-DD), or null when malformed.
export function monthBounds(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) return null;
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

type ChargeLike = { family_id: string; amount_cents: number; due_date: string; status: ChargeStatus };

// Month KPIs consider charges due in the month; delinquency spans every month.
export function summarizeCharges(charges: ChargeLike[], month: { start: string; end: string }, today: string) {
  const inMonth = charges.filter((c) => c.due_date >= month.start && c.due_date <= month.end && c.status !== "canceled");
  const sum = (list: ChargeLike[]) => list.reduce((total, c) => total + c.amount_cents, 0);
  const overdue = charges.filter((c) => chargeDisplayStatus(c.status, c.due_date, today) === "overdue");
  return {
    billedCents: sum(inMonth),
    receivedCents: sum(inMonth.filter((c) => c.status === "paid")),
    insuranceCents: sum(inMonth.filter((c) => c.status === "awaiting_insurance")),
    overdueCents: sum(overdue),
    overdueFamilies: new Set(overdue.map((c) => c.family_id)).size,
  };
}

// Mirrors public.compute_session_amount (per_hour rounds to the cent).
export function computeSessionAmount(model: PayModel, rateCents: number, minutes: number): number {
  return model === "per_session" ? rateCents : Math.round((rateCents * minutes) / 60);
}

type RateLike = { therapist_id: string; therapy_id: string; pay_model: PayModel; amount_cents: number; valid_from: string };

// Mirrors public.rate_for: the latest rate whose validity started on or before the date.
export function rateOn<T extends RateLike>(rates: T[], therapistId: string, therapyId: string, date: string): T | null {
  let best: T | null = null;
  for (const rate of rates) {
    if (rate.therapist_id !== therapistId || rate.therapy_id !== therapyId || rate.valid_from > date) continue;
    if (!best || rate.valid_from > best.valid_from) best = rate;
  }
  return best;
}

export function describeRule(model: PayModel, rateCents: number): string {
  return model === "per_session" ? `${formatCents(rateCents)} por sessão` : `${formatCents(rateCents)}/hora`;
}

const pairKey = (therapistId: string, therapyId: string) => `${therapistId}|${therapyId}`;

type SessionLike = { therapist_id: string; therapy_id: string; status: AppointmentStatus; date: string; minutes: number };

export type SessionSummaryRow = {
  therapistId: string;
  therapyId: string;
  completed: number;
  noShow: number;
  canceled: number;
  completedMinutes: number;
  estimatedCents: number;
  missingRate: boolean;
};

// "Relatório das terapias": what happened per therapist × therapy and what it is worth.
export function summarizeSessions(sessions: SessionLike[], rates: RateLike[]): SessionSummaryRow[] {
  const rows = new Map<string, SessionSummaryRow>();
  for (const s of sessions) {
    const key = pairKey(s.therapist_id, s.therapy_id);
    let row = rows.get(key);
    if (!row) {
      row = { therapistId: s.therapist_id, therapyId: s.therapy_id, completed: 0, noShow: 0, canceled: 0, completedMinutes: 0, estimatedCents: 0, missingRate: false };
      rows.set(key, row);
    }
    if (s.status === "no_show") row.noShow += 1;
    else if (s.status === "canceled") row.canceled += 1;
    else if (s.status === "completed") {
      row.completed += 1;
      row.completedMinutes += s.minutes;
      const rate = rateOn(rates, s.therapist_id, s.therapy_id, s.date);
      if (rate) row.estimatedCents += computeSessionAmount(rate.pay_model, rate.amount_cents, s.minutes);
      else row.missingRate = true;
    }
  }
  return [...rows.values()];
}

type PreviewItem = {
  therapist_id: string;
  therapy_id: string;
  minutes: number;
  pay_model: PayModel | null;
  rate_cents: number | null;
  amount_cents: number | null;
};

export type PreviewGroup = {
  therapistId: string;
  therapyId: string;
  sessions: number;
  minutes: number;
  rules: string[];
  totalCents: number;
  missingRate: boolean;
};

// Groups preview_invoice_items rows the way generate_invoice_requests will bill them.
export function groupPreview(items: PreviewItem[]): PreviewGroup[] {
  const groups = new Map<string, PreviewGroup>();
  for (const item of items) {
    const key = pairKey(item.therapist_id, item.therapy_id);
    let group = groups.get(key);
    if (!group) {
      group = { therapistId: item.therapist_id, therapyId: item.therapy_id, sessions: 0, minutes: 0, rules: [], totalCents: 0, missingRate: false };
      groups.set(key, group);
    }
    group.sessions += 1;
    group.minutes += item.minutes;
    if (item.amount_cents == null || item.pay_model == null || item.rate_cents == null) {
      group.missingRate = true;
      continue;
    }
    group.totalCents += item.amount_cents;
    const rule = describeRule(item.pay_model, item.rate_cents);
    if (!group.rules.includes(rule)) group.rules.push(rule);
  }
  return [...groups.values()];
}

// Statuses a manager can set by hand ("overdue" stays derived from the due date).
export const CHARGE_STATUS_OPTIONS: { value: ChargeStatus; label: string }[] = [
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "awaiting_insurance", label: "Aguardando convênio" },
  { value: "canceled", label: "Cancelado" },
];

export const RECEIPT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
export const RECEIPT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic";

// Payment receipts are PDFs or photos; size is enforced by uploadUserFile.
export function receiptFileError(file: { type: string; size: number } | null): string | null {
  if (!file || file.size === 0) return "Anexe o comprovante.";
  if (!RECEIPT_MIME_TYPES.includes(file.type)) return "Envie o comprovante em PDF ou imagem (JPG, PNG, WEBP, HEIC).";
  return null;
}

export type Balance = { paidCents: number; openCents: number; overdueCents: number; count: number };

// Totals per family: paid, still open (pending + awaiting insurance) and the overdue part of open.
export function familyBalances(charges: ChargeLike[], today: string): Map<string, Balance> {
  const balances = new Map<string, Balance>();
  for (const c of charges) {
    const entry = balances.get(c.family_id) ?? { paidCents: 0, openCents: 0, overdueCents: 0, count: 0 };
    entry.count += 1;
    if (c.status === "paid") entry.paidCents += c.amount_cents;
    else if (c.status === "pending" || c.status === "awaiting_insurance") {
      entry.openCents += c.amount_cents;
      if (chargeDisplayStatus(c.status, c.due_date, today) === "overdue") entry.overdueCents += c.amount_cents;
    }
    balances.set(c.family_id, entry);
  }
  return balances;
}

type RequestLike = { therapist_id: string; amount_cents: number; status: InvoiceStatus; paid_on: string | null };

export type PayoutTotals = { paidInRangeCents: number; paidInYearCents: number; openCents: number; count: number };

// Totals per payee. `paid_on` is the local date of the payment; open = anything not paid yet.
export function payoutTotals(requests: RequestLike[], range: { start: string; end: string }, year: string): Map<string, PayoutTotals> {
  const totals = new Map<string, PayoutTotals>();
  for (const r of requests) {
    const entry = totals.get(r.therapist_id) ?? { paidInRangeCents: 0, paidInYearCents: 0, openCents: 0, count: 0 };
    entry.count += 1;
    if (r.status === "paid" && r.paid_on) {
      if (r.paid_on >= range.start && r.paid_on <= range.end) entry.paidInRangeCents += r.amount_cents;
      if (r.paid_on.startsWith(`${year}-`)) entry.paidInYearCents += r.amount_cents;
    } else if (r.status !== "paid") {
      entry.openCents += r.amount_cents;
    }
    totals.set(r.therapist_id, entry);
  }
  return totals;
}

// "2026" → whole year; "2026-10" → that month; null when malformed.
export function paymentRange(year: string, month: string | null): { start: string; end: string } | null {
  if (!/^\d{4}$/.test(year)) return null;
  if (!month) return { start: `${year}-01-01`, end: `${year}-12-31` };
  return monthBounds(`${year}-${month}`);
}

// Session-based requests are named by therapy and period; manual ones by their description.
export function requestTitle(request: {
  description: string | null;
  therapy: { name: string } | null;
  period: { label: string } | null;
}): string {
  if (request.period) return `${request.therapy?.name ?? "Terapia"} · ${request.period.label}`;
  return request.description ?? "Solicitação avulsa";
}
