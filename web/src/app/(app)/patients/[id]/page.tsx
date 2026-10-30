import Link from "next/link";
import { notFound } from "next/navigation";
import { MANAGER_ROLES, STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, formatDate, localDateKey } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, InfoRow, Tabs } from "@/components/ui/primitives";
import { STATUS_META, isAssignmentActive } from "@/components/patients/patient-helpers";
import { PatientForm } from "@/components/patients/patient-form";
import { CareTab } from "@/components/patients/care-tab";
import { SessionsTab } from "@/components/patients/sessions-tab";
import { NewAppointment } from "@/components/schedule/new-appointment";
import { loadSchedulingOptions } from "@/components/schedule/scheduling-options";
import { RecordTab } from "@/components/patients/record-tab";
import { PlanTab } from "@/components/patients/plan-tab";
import { ReportsTab, DocumentsTab } from "@/components/patients/files-tabs";
import { updatePatient } from "../actions";

const TAB_LABELS = {
  data: "Dados",
  care: "Vínculos",
  sessions: "Agenda e sessões",
  record: "Prontuário",
  plan: "Plano de atendimento",
  reports: "Relatórios",
  documents: "Documentos",
} as const;
type TabKey = keyof typeof TAB_LABELS;

export default async function PatientPage({ params, searchParams }: PageProps<"/patients/[id]">) {
  const user = await requireRole(TEAM_ROLES);
  const { id } = await params;
  const { tab } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select(
      `id, family_id, full_name, birth_date, diagnosis, insurance_name, insurance_number, school, status, care_started_on, created_at,
       family:families (id, name),
       care_assignments (id, therapist_id, therapy_id, frequency, starts_on, ends_on, therapy:therapies (id, name), therapist:therapists (id, color, profile:profiles (full_name)))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!patient) notFound();

  const today = localDateKey(new Date());
  const activeAssignments = patient.care_assignments.filter((ca) => isAssignmentActive(ca.starts_on, ca.ends_on, today));
  const isStaff = STAFF_ROLES.includes(user.role);
  const isManager = MANAGER_ROLES.includes(user.role);
  const isLinkedTherapist = user.role === "therapist" && activeAssignments.some((ca) => ca.therapist_id === user.id);
  const canSeeRecord = user.role === "coordination" || isLinkedTherapist;
  const canSeeFiles = isManager || user.role === "therapist";
  const activeTherapists = [...new Map(activeAssignments.map((ca) => [ca.therapist_id, ca.therapist?.profile?.full_name ?? "Terapeuta"])).entries()].map(
    ([therapistId, name]) => ({ id: therapistId, name }),
  );

  const allowed: TabKey[] = ["data", "care", "sessions"];
  if (canSeeRecord) allowed.push("record", "plan");
  if (canSeeFiles) allowed.push("reports", "documents");
  const active: TabKey = allowed.includes(tab as TabKey) ? (tab as TabKey) : "data";

  const age = ageFrom(patient.birth_date);
  const status = STATUS_META[patient.status];
  const therapistColor = activeAssignments[0]?.therapist?.color ?? undefined;
  const canSchedule = isStaff && patient.status !== "inactive";
  const scheduling = canSchedule ? await loadSchedulingOptions({ patientIds: [id] }) : null;

  return (
    <>
      <Link href="/patients" className="mb-4 inline-block text-sm font-semibold text-primary hover:underline">
        ← Pacientes
      </Link>

      <Card className="mb-6 flex flex-wrap items-center gap-5">
        <Avatar name={patient.full_name} color={therapistColor} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-t1">{patient.full_name}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-t2">
            <span>{age != null ? `${age} anos` : "Idade não informada"}</span>
            <span>{patient.diagnosis || "Sem diagnóstico registrado"}</span>
            {patient.family && (
              <Link href={`/families/${patient.family.id}`} className="text-primary hover:underline">
                {patient.family.name}
              </Link>
            )}
            <span>Convênio: {patient.insurance_name}</span>
          </div>
        </div>
        {scheduling && scheduling.assignments.length > 0 && (
          <NewAppointment
            trigger="+ Agendar sessão"
            assignments={scheduling.assignments}
            rooms={scheduling.rooms}
            defaultDate={today}
            defaultPatientId={id}
          />
        )}
      </Card>

      <Tabs active={active} tabs={allowed.map((key) => ({ key, label: TAB_LABELS[key], href: `/patients/${id}?tab=${key}` }))} />

      {active === "data" &&
        (isStaff ? (
          <Card>
            <CardTitle>Dados cadastrais</CardTitle>
            <PatientForm
              action={updatePatient}
              mode="edit"
              values={{
                id: patient.id,
                full_name: patient.full_name,
                birth_date: patient.birth_date,
                diagnosis: patient.diagnosis,
                insurance_name: patient.insurance_name,
                insurance_number: patient.insurance_number,
                school: patient.school,
                care_started_on: patient.care_started_on,
                status: patient.status,
              }}
            />
          </Card>
        ) : (
          <Card className="max-w-2xl">
            <CardTitle>Dados cadastrais</CardTitle>
            <InfoRow label="Nome">{patient.full_name}</InfoRow>
            <InfoRow label="Nascimento">{formatDate(patient.birth_date)}</InfoRow>
            <InfoRow label="Diagnóstico / CID">{patient.diagnosis || "—"}</InfoRow>
            <InfoRow label="Convênio">
              {patient.insurance_name}
              {patient.insurance_number ? ` · ${patient.insurance_number}` : ""}
            </InfoRow>
            <InfoRow label="Escola">{patient.school || "—"}</InfoRow>
            <InfoRow label="Início do atendimento">{formatDate(patient.care_started_on)}</InfoRow>
            <InfoRow label="Status">
              <Badge tone={status.tone}>{status.label}</Badge>
            </InfoRow>
          </Card>
        ))}

      {active === "care" && (
        <CareTab patientId={id} assignments={patient.care_assignments} canManage={isManager} today={today} scheduling={scheduling} />
      )}
      {active === "sessions" && (
        <SessionsTab
          patientId={id}
          patientName={patient.full_name}
          viewer={{ userId: user.id, isStaff }}
          canSchedule={canSchedule}
          canResolveDisputes={isManager}
        />
      )}
      {active === "record" && <RecordTab patientId={id} userId={user.id} canWrite={isLinkedTherapist} today={today} />}
      {active === "plan" && (
        <PlanTab
          patientId={id}
          userId={user.id}
          myTherapies={isLinkedTherapist ? activeAssignments.filter((ca) => ca.therapist_id === user.id).flatMap((ca) => (ca.therapy ? [ca.therapy] : [])) : []}
        />
      )}
      {active === "reports" && (
        <ReportsTab
          patient={{ id, name: patient.full_name, therapists: activeTherapists }}
          canRequest={isManager}
          canUpload={isManager || isLinkedTherapist}
          isTherapist={user.role === "therapist"}
          userId={user.id}
        />
      )}
      {active === "documents" && <DocumentsTab patient={{ id, name: patient.full_name }} canUpload={isManager || isLinkedTherapist} />}
    </>
  );
}
