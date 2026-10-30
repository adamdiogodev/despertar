import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { NewAppointment, type AssignmentOption } from "@/components/schedule/new-appointment";
import type { Option } from "@/components/schedule/types";
import { AddCareAssignmentForm, EndCareAssignmentForm } from "./care-assignment-forms";
import { isAssignmentActive } from "./patient-helpers";

type Assignment = {
  id: string;
  frequency: string | null;
  starts_on: string;
  ends_on: string | null;
  therapy: { id: string; name: string } | null;
  therapist: { id: string; profile: { full_name: string } | null } | null;
};

export async function CareTab({
  patientId,
  assignments,
  canManage,
  today,
  scheduling,
}: {
  patientId: string;
  assignments: Assignment[];
  canManage: boolean;
  today: string;
  // Present when the viewer may schedule this patient.
  scheduling: { assignments: AssignmentOption[]; rooms: Option[] } | null;
}) {
  let therapists: { id: string; name: string }[] = [];
  let therapies: { id: string; name: string }[] = [];
  if (canManage) {
    const supabase = await createClient();
    const [therapistsResult, therapiesResult] = await Promise.all([
      supabase.from("therapists").select("id, profile:profiles!inner (full_name, active)").eq("profile.active", true),
      supabase.from("therapies").select("id, name").eq("active", true).order("name"),
    ]);
    therapists = (therapistsResult.data ?? [])
      .map((row) => ({ id: row.id, name: row.profile.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    therapies = therapiesResult.data ?? [];
  }

  // Open assignments first, then most recent.
  const sorted = [...assignments].sort((a, b) => Number(a.ends_on !== null) - Number(b.ends_on !== null) || b.starts_on.localeCompare(a.starts_on));

  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle action={canManage && <AddCareAssignmentForm patientId={patientId} therapists={therapists} therapies={therapies} today={today} />}>
          Vínculos terapêuticos
        </CardTitle>
        {canManage && (
          <Alert tone="yellow">
            O vínculo controla o acesso: encerrá-lo corta o acesso do terapeuta a este paciente (ficha, prontuário, plano, agenda) e o chat com a família.
          </Alert>
        )}
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon="🔗" title="Nenhum vínculo" description="Vincule um terapeuta para iniciar o atendimento." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Terapeuta</Th>
              <Th>Terapia</Th>
              <Th>Frequência</Th>
              <Th>Início</Th>
              <Th>Fim</Th>
              <Th>Situação</Th>
              {(canManage || scheduling) && <Th />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((assignment) => {
              const active = isAssignmentActive(assignment.starts_on, assignment.ends_on, today);
              const therapistName = assignment.therapist?.profile?.full_name ?? "—";
              return (
                <tr key={assignment.id} data-testid="care-assignment-row">
                  <Td className="font-semibold text-t1">{therapistName}</Td>
                  <Td>{assignment.therapy?.name ?? "—"}</Td>
                  <Td>{assignment.frequency || "—"}</Td>
                  <Td>{formatDate(assignment.starts_on)}</Td>
                  <Td>{assignment.ends_on ? formatDate(assignment.ends_on) : "—"}</Td>
                  <Td>
                    {active ? (
                      <Badge tone="green">Vigente</Badge>
                    ) : assignment.starts_on > today ? (
                      <Badge tone="blue">Futuro</Badge>
                    ) : (
                      <Badge tone="gray">Encerrado</Badge>
                    )}
                  </Td>
                  {(canManage || scheduling) && (
                    <Td className="whitespace-nowrap">
                      {scheduling &&
                        (assignment.ends_on === null || assignment.ends_on >= today) &&
                        scheduling.assignments.some((item) => item.therapistId === assignment.therapist?.id && item.therapyId === assignment.therapy?.id) && (
                          <span className="mr-2 inline-block">
                            <NewAppointment
                              trigger="Agendar"
                              triggerVariant="outline"
                              assignments={scheduling.assignments}
                              rooms={scheduling.rooms}
                              defaultDate={today}
                              defaultPatientId={patientId}
                              defaultAssignment={`${assignment.therapist?.id}:${assignment.therapy?.id}`}
                            />
                          </span>
                        )}
                      {canManage && assignment.ends_on === null && (
                        <EndCareAssignmentForm
                          assignmentId={assignment.id}
                          patientId={patientId}
                          label={`${therapistName} · ${assignment.therapy?.name ?? ""}`}
                          startsOn={assignment.starts_on}
                          today={today}
                        />
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
