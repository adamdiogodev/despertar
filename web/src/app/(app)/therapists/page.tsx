import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { OPEN_REPORT_STATUSES } from "@/components/admin/labels";
import { NewTherapistButton } from "./therapist-forms";

export const metadata = { title: "Terapeutas — Sistema Despertar" };

export default async function TherapistsPage() {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const isManager = MANAGER_ROLES.includes(user.role);
  const today = localDateKey(new Date());

  const supabase = await createClient();
  const [{ data: therapists }, { data: assignments }, { data: reports }] = await Promise.all([
    supabase.from("therapists").select("id, specialty, council_registry, color, profiles(full_name, active)"),
    supabase
      .from("care_assignments")
      .select("therapist_id, patient_id")
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
    supabase.from("reports").select("therapist_id").in("status", [...OPEN_REPORT_STATUSES]),
  ]);

  const patientsBy = new Map<string, Set<string>>();
  for (const assignment of assignments ?? []) {
    const set = patientsBy.get(assignment.therapist_id) ?? new Set<string>();
    set.add(assignment.patient_id);
    patientsBy.set(assignment.therapist_id, set);
  }
  const reportsBy = new Map<string, number>();
  for (const report of reports ?? []) reportsBy.set(report.therapist_id, (reportsBy.get(report.therapist_id) ?? 0) + 1);

  const sorted = [...(therapists ?? [])]
    .filter((therapist) => therapist.profiles)
    .sort((a, b) => a.profiles!.full_name.localeCompare(b.profiles!.full_name, "pt-BR"));

  return (
    <>
      <PageHeader
        title="Terapeutas"
        description="Profissionais, pacientes vinculados e pendências de relatório"
        actions={user.role === "admin" && <NewTherapistButton />}
      />
      {sorted.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum terapeuta cadastrado" icon="🩺" />
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" data-testid="therapist-grid">
          {sorted.map((therapist) => {
            // Workload numbers come from RLS-filtered data, so they are only complete
            // for managers and for the therapist's own card.
            const showStats = isManager || therapist.id === user.id;
            const pendingReports = reportsBy.get(therapist.id) ?? 0;
            return (
              <Link key={therapist.id} href={`/therapists/${therapist.id}`}>
                <Card className="flex h-full flex-col items-center text-center transition-shadow hover:shadow-pop">
                  <Avatar name={therapist.profiles!.full_name} color={therapist.color} size={60} />
                  <div className="mt-3 text-sm font-bold text-t1">{therapist.profiles!.full_name}</div>
                  <div className="text-xs text-t2">{therapist.specialty}</div>
                  {therapist.council_registry && <div className="mt-0.5 text-[10px] text-t3">{therapist.council_registry}</div>}
                  {!therapist.profiles!.active && (
                    <Badge tone="gray" className="mt-2">
                      Inativo
                    </Badge>
                  )}
                  {showStats && (
                    <div className="mt-4 grid w-full grid-cols-2 gap-2 border-t border-line-light pt-3">
                      <div>
                        <div className="text-lg font-extrabold text-t1">{patientsBy.get(therapist.id)?.size ?? 0}</div>
                        <div className="text-[10px] font-semibold uppercase text-t3">Pacientes</div>
                      </div>
                      <div>
                        <div className={pendingReports > 0 ? "text-lg font-extrabold text-warn" : "text-lg font-extrabold text-ok"}>
                          {pendingReports}
                        </div>
                        <div className="text-[10px] font-semibold uppercase text-t3">Pend. relatórios</div>
                      </div>
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
