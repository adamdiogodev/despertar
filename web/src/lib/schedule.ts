import { zonedToIso } from "@/lib/format";

const TIME_ZONE = "America/Sao_Paulo";

// Visible grid: Monday–Saturday, 07:00–20:00.
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 20;
export const GRID_DAYS = 6;
export const DEFAULT_DURATION_MINUTES = 50;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value) && !Number.isNaN(parseKey(value).getTime()) && toKey(parseKey(value)) === value;
}

export function addDays(dateKey: string, days: number): string {
  const date = parseKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

// Monday of the week containing dateKey (Sunday belongs to the week that ends on it).
export function weekStart(dateKey: string): string {
  const weekday = parseKey(dateKey).getUTCDay(); // 0 = Sunday
  return addDays(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

// ?week= value → a valid Monday; falls back to the current week.
export function resolveWeek(param: string | string[] | undefined, todayKey: string): string {
  const value = Array.isArray(param) ? param[0] : param;
  return weekStart(isDateKey(value) ? value : todayKey);
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: GRID_DAYS }, (_, index) => addDays(monday, index));
}

// [Monday 00:00, Sunday 00:00) in São Paulo, as UTC ISO strings — the visible days.
export function weekRange(monday: string): { from: string; to: string } {
  return { from: zonedToIso(monday, "00:00"), to: zonedToIso(addDays(monday, GRID_DAYS), "00:00") };
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function weekLabel(monday: string): string {
  const [first, last] = [parseKey(monday), parseKey(addDays(monday, GRID_DAYS - 1))];
  const part = (date: Date) => `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]}`;
  return `${part(first)} — ${part(last)} ${last.getUTCFullYear()}`;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "HH:MM" in São Paulo.
export function localTimeKey(value: string | Date): string {
  return timeFormatter.format(new Date(value));
}

// Minutes since local midnight in São Paulo.
export function localMinutes(value: string | Date): number {
  const [hours, minutes] = localTimeKey(value).split(":").map(Number);
  return hours * 60 + minutes;
}

// Top/height in px of a session block, clipped to the visible hours.
export function blockPosition(startsAt: string, endsAt: string, hourHeight: number): { top: number; height: number } {
  const gridStart = GRID_START_HOUR * 60;
  const gridEnd = GRID_END_HOUR * 60;
  const start = Math.min(Math.max(localMinutes(startsAt), gridStart), gridEnd);
  const durationMin = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  const end = Math.min(Math.max(localMinutes(startsAt) + durationMin, gridStart), gridEnd);
  const minHeight = hourHeight / 4;
  return {
    top: ((start - gridStart) / 60) * hourHeight,
    height: Math.max(((end - start) / 60) * hourHeight, minHeight),
  };
}

// Side-by-side lanes for overlapping sessions of the same day column.
// Returns, per item (same order), its lane and the lane count of its overlap cluster.
export function layoutLanes(items: { startsAt: string; endsAt: string }[]): { lane: number; lanes: number }[] {
  const order = items
    .map((item, index) => ({ index, start: new Date(item.startsAt).getTime(), end: new Date(item.endsAt).getTime() }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: { lane: number; lanes: number }[] = items.map(() => ({ lane: 0, lanes: 1 }));

  let cluster: typeof order = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const item of cluster) result[item.index].lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const item of order) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    result[item.index].lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

// Weekly occurrences starting on dateKey at time (São Paulo).
export function weeklyOccurrences(
  dateKey: string,
  time: string,
  durationMin: number,
  weeks: number,
): { date: string; startsAt: string; endsAt: string }[] {
  return Array.from({ length: Math.max(1, weeks) }, (_, index) => {
    const date = addDays(dateKey, index * 7);
    const startsAt = zonedToIso(date, time);
    const endsAt = new Date(new Date(startsAt).getTime() + durationMin * 60000).toISOString();
    return { date, startsAt, endsAt };
  });
}

// Agenda fixa weekdays: 0 = Sunday … 6 = Saturday, like Date#getUTCDay and Postgres extract(dow).
export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// Days offered in the form — the grid shows Monday to Saturday.
export const SCHEDULABLE_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export function weekdayOf(dateKey: string): number {
  return parseKey(dateKey).getUTCDay();
}

// [4, 2] → "ter, qui"
export function weekdaysLabel(days: number[]): string {
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_SHORT[day])
    .join(", ");
}
