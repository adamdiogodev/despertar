import "server-only";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/format";

export type PortalAssignment = {
  id: string;
  frequency: string | null;
  starts_on: string;
  therapy: string;
  therapistId: string;
  therapistName: string;
  specialty: string;
  councilRegistry: string | null;
};

export type PortalChild = {
  id: string;
  familyId: string;
  familyName: string;
  fullName: string;
  birthDate: string | null;
  insuranceName: string;
  insuranceNumber: string | null;
  school: string | null;
  careStartedOn: string | null;
  assignments: PortalAssignment[];
};

// Everything the portal needs to know about "my children". RLS returns only the
// guardian's own families, so the selected child is trusted only if it is in this list.
export async function loadPortalChildren(childParam: string | string[] | undefined) {
  const supabase = await createClient();
  const today = localDateKey(new Date());
  const { data, error } = await supabase
    .from("patients")
    .select(
      "id, family_id, full_name, birth_date, insurance_name, insurance_number, school, care_started_on, families(name), care_assignments(id, frequency, starts_on, ends_on, therapies(name), therapists(id, specialty, council_registry, profiles(full_name)))",
    )
    .order("full_name");
  if (error) console.error("[portal] children", error);

  const children: PortalChild[] = (data ?? []).map((patient) => ({
    id: patient.id,
    familyId: patient.family_id,
    familyName: patient.families?.name ?? "",
    fullName: patient.full_name,
    birthDate: patient.birth_date,
    insuranceName: patient.insurance_name,
    insuranceNumber: patient.insurance_number,
    school: patient.school,
    careStartedOn: patient.care_started_on,
    assignments: patient.care_assignments
      .filter((ca) => ca.starts_on <= today && (!ca.ends_on || ca.ends_on >= today))
      .map((ca) => ({
        id: ca.id,
        frequency: ca.frequency,
        starts_on: ca.starts_on,
        therapy: ca.therapies?.name ?? "",
        therapistId: ca.therapists?.id ?? "",
        therapistName: ca.therapists?.profiles?.full_name ?? "Terapeuta",
        specialty: ca.therapists?.specialty ?? "",
        councilRegistry: ca.therapists?.council_registry ?? null,
      })),
  }));

  const requested = typeof childParam === "string" ? childParam : undefined;
  const selected = children.find((child) => child.id === requested) ?? null;
  const visible = selected ? [selected] : children;
  return {
    children,
    selected,
    selectedId: selected?.id ?? null,
    patientIds: visible.map((child) => child.id),
    familyIds: [...new Set(visible.map((child) => child.familyId))],
  };
}

export async function loadClinicSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("clinic_settings").select("name, phone, whatsapp, email, address, reschedule_min_hours").single();
  return data ?? { name: "Clínica Despertar", phone: null, whatsapp: null, email: null, address: null, reschedule_min_hours: 24 };
}

export type ClinicSettings = Awaited<ReturnType<typeof loadClinicSettings>>;
