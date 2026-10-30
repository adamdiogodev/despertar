import { createClient } from "@/lib/supabase/server";
import { formatDate, localDateKey } from "@/lib/format";
import { weekdaysLabel } from "@/lib/schedule";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { EndRecurringSchedule } from "./end-recurring-schedule";

// Agenda fixa rules of a patient. Open rules first; ended ones stay listed for history.
export async function RecurringSchedules({ patientId, canManage }: { patientId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("recurring_schedules")
    .select("id, weekdays, start_time, duration_minutes, starts_on, ends_on, therapy:therapies (name), room:rooms (name), therapist:therapists (profile:profiles (full_name))")
    .eq("patient_id", patientId)
    .order("starts_on", { ascending: false });
  if (!rules?.length) return null;

  const today = localDateKey(new Date());
  const sorted = [...rules].sort((a, b) => Number(isEnded(a.ends_on, today)) - Number(isEnded(b.ends_on, today)));

  return (
    <Card data-testid="recurring-schedules">
      <CardTitle>Agenda fixa</CardTitle>
      <ul className="divide-y divide-line-light">
        {sorted.map((rule) => {
          const ended = isEnded(rule.ends_on, today);
          const label = `${weekdaysLabel(rule.weekdays)} às ${rule.start_time.slice(0, 5)}`;
          return (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3 text-sm" data-testid="recurring-schedule-row">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-t1">
                  {label} · {rule.duration_minutes} min
                </div>
                <div className="text-xs text-t2">
                  {rule.therapist?.profile?.full_name ?? "Terapeuta"} — {rule.therapy?.name ?? "—"}
                  {rule.room ? ` · ${rule.room.name}` : ""} · desde {formatDate(rule.starts_on)}
                  {rule.ends_on ? ` até ${formatDate(rule.ends_on)}` : ""}
                </div>
              </div>
              {ended ? (
                <Badge tone="gray">Encerrada</Badge>
              ) : rule.ends_on ? (
                <Badge tone="yellow">Até {formatDate(rule.ends_on)}</Badge>
              ) : (
                <Badge tone="green">Ativa</Badge>
              )}
              {canManage && !rule.ends_on && <EndRecurringSchedule id={rule.id} label={label} today={today} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function isEnded(endsOn: string | null, today: string) {
  return endsOn !== null && endsOn < today;
}
