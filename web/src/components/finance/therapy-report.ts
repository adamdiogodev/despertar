import "server-only";
import { createClient } from "@/lib/supabase/server";
import { durationMinutes, localDateKey, zonedToIso } from "@/lib/format";
import { summarizeSessions } from "./logic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Defaults to the current month up to today; swaps an inverted range.
export function reportRange(from: unknown, to: unknown) {
  const today = localDateKey(new Date());
  let start = typeof from === "string" && DATE.test(from) ? from : `${today.slice(0, 7)}-01`;
  let end = typeof to === "string" && DATE.test(to) ? to : today;
  if (end < start) [start, end] = [end, start];
  return { from: start, to: end };
}

// Sessions per therapist × therapy in the date range, read as the signed-in user (RLS).
export async function loadTherapyReport(from: string, to: string) {
  const supabase = await createClient();
  const [appointmentsRes, ratesRes, therapistsRes, therapiesRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("therapist_id, therapy_id, starts_at, ends_at, status")
      .in("status", ["completed", "no_show", "canceled"])
      .gte("starts_at", zonedToIso(from, "00:00"))
      .lt("starts_at", zonedToIso(addDays(to, 1), "00:00")),
    supabase.from("therapist_rates").select("therapist_id, therapy_id, pay_model, amount_cents, valid_from"),
    supabase.from("therapists").select("id, profile:profiles(full_name)"),
    supabase.from("therapies").select("id, name"),
  ]);
  if (appointmentsRes.error) throw appointmentsRes.error;

  const therapistName = new Map((therapistsRes.data ?? []).map((t) => [t.id, t.profile?.full_name ?? "Terapeuta"]));
  const therapyName = new Map((therapiesRes.data ?? []).map((t) => [t.id, t.name]));
  const sessions = appointmentsRes.data.map((a) => ({
    therapist_id: a.therapist_id,
    therapy_id: a.therapy_id,
    status: a.status,
    date: localDateKey(a.starts_at),
    minutes: durationMinutes(a.starts_at, a.ends_at),
  }));

  return summarizeSessions(sessions, ratesRes.data ?? [])
    .map((row) => ({ ...row, therapistName: therapistName.get(row.therapistId) ?? "—", therapyName: therapyName.get(row.therapyId) ?? "—" }))
    .sort((a, b) => a.therapistName.localeCompare(b.therapistName) || a.therapyName.localeCompare(b.therapyName));
}
