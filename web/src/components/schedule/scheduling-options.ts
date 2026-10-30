import "server-only";
import { localDateKey } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AssignmentOption } from "./new-appointment";
import type { Option } from "./types";

// Open care assignments (current or starting later) and active rooms — what the
// "agendar" modal needs. Inactive patients cannot be scheduled.
export async function loadSchedulingOptions(filter: { patientIds?: string[]; therapistId?: string } = {}): Promise<{
  assignments: AssignmentOption[];
  rooms: Option[];
}> {
  const supabase = await createClient();
  let query = supabase
    .from("care_assignments")
    .select("patient_id, therapist_id, therapy_id, patients(full_name, status), therapies(name), therapists(profiles(full_name))")
    .or(`ends_on.is.null,ends_on.gte.${localDateKey(new Date())}`);
  if (filter.patientIds) query = query.in("patient_id", filter.patientIds);
  if (filter.therapistId) query = query.eq("therapist_id", filter.therapistId);

  const [{ data: rows }, { data: rooms }] = await Promise.all([query, supabase.from("rooms").select("id, name").eq("active", true).order("name")]);
  const assignments = (rows ?? [])
    .filter((row) => row.patients && row.patients.status !== "inactive")
    .map((row) => ({
      patientId: row.patient_id,
      patientName: row.patients?.full_name ?? "",
      therapistId: row.therapist_id,
      therapistName: row.therapists?.profiles?.full_name ?? "",
      therapyId: row.therapy_id,
      therapyName: row.therapies?.name ?? "",
    }));
  return { assignments, rooms: rooms ?? [] };
}
