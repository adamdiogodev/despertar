import Link from "next/link";
import { notFound } from "next/navigation";
import { MANAGER_ROLES, STAFF_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, localDateKey } from "@/lib/format";
import { Alert, Avatar, Badge, Card, CardTitle, EmptyState, InfoRow, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { NewAppointment } from "@/components/schedule/new-appointment";
import { loadSchedulingOptions } from "@/components/schedule/scheduling-options";
import { OPEN_REPORT_STATUSES, PAY_MODEL_LABELS, REPORT_TYPE_LABELS } from "@/components/admin/labels";
import { AddRateForm, EditTherapistForm } from "../therapist-forms";

export const metadata = { title: "Terapeuta — Sistema Despertar" };

export default async function TherapistDetailPage({ params, searchParams }: PageProps<"/therapists/[id]">) {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const { id } = await params;
  const { created } = await searchParams;
  const isAdmin = user.role === "admin";
  const isSelf = user.id === id;
  // Workload and pay are visible to management and to the therapist themself.
  const canSeeDetails = MANAGER_ROLES.includes(user.role) || isSelf;
  const today = localDateKey(new Date());

  const supabase = await createClient();
  const { data: therapist } = await supabase
    .from("therapists")
    .select("id, specialty, council_registry, color, profiles(full_name, email, phone, active)")
    .eq("id", id)
    .maybeSingle();
  if (!therapist?.profiles) notFound();

  const [{ data: assignments }, { data: reports }, { data: rates }, { data: therapies }] = canSeeDetails
    ? await Promise.all([
        supabase
          .from("care_assignments")
          .select("id, frequency, starts_on, therapy_id, patients(id, full_name), therapies(name)")
          .eq("therapist_id", id)
          .lte("starts_on", today)
          .or(`ends_on.is.null,ends_on.gte.${today}`)
          .order("starts_on"),
        supabase
          .from("reports")
          .select("id, report_type, reference_label, due_date, status, patients(full_name)")
          .eq("therapist_id", id)
          .in("status", [...OPEN_REPORT_STATUSES])
          .order("due_date", { nullsFirst: false }),
        supabase
          .from("therapist_rates")
          .select("id, therapy_id, pay_model, amount_cents, valid_from, therapies(name)")
          .eq("therapist_id", id)
          .order("valid_from", { ascending: false }),
        isAdmin ? supabase.from("therapies").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const scheduling = canSeeDetails && STAFF_ROLES.includes(user.role) ? await loadSchedulingOptions({ therapistId: id }) : null;

  // The rate in force today per therapy is the latest one already started.
  const currentRateIds = new Set<string>();
  const seenTherapies = new Set<string>();
  for (const rate of rates ?? []) {
    if (rate.valid_from <= today && !seenTherapies.has(rate.therapy_id)) {
      seenTherapies.add(rate.therapy_id);
      currentRateIds.add(rate.id);
    }
  }

  const profile = therapist.profiles;

  return (
    <>
      <PageHeader title={profile.full_name} description={therapist.specialty} />
      {created && <Alert tone="green">Terapeuta criado. O convite de acesso foi enviado por e-mail.</Alert>}
      <Link href="/therapists" className="mb-4 inline-block text-xs font-semibold text-primary hover:underline">
        ← Todos os terapeutas
      </Link>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-4 flex items-center gap-4">
              <Avatar name={profile.full_name} color={therapist.color} size={56} />
              <div>
                <div className="text-base font-extrabold text-t1">{profile.full_name}</div>
                <div className="text-xs text-t3">
                  {therapist.specialty}
                  {therapist.council_registry ? ` · ${therapist.council_registry}` : ""}
                </div>
              </div>
            </div>
            <InfoRow label="E-mail">{profile.email}</InfoRow>
            <InfoRow label="Telefone">{profile.phone ?? "—"}</InfoRow>
            <InfoRow label="Status">
              <Badge tone={profile.active ? "green" : "gray"}>{profile.active ? "Ativo" : "Inativo"}</Badge>
            </InfoRow>
            {canSeeDetails && (
              <>
                <InfoRow label="Pacientes vinculados">{new Set(assignments?.map((a) => a.patients?.id)).size}</InfoRow>
                <InfoRow label="Relatórios pendentes">
                  <Badge tone={reports?.length ? "yellow" : "green"}>{reports?.length ?? 0}</Badge>
                </InfoRow>
              </>
            )}
          </Card>
          {isAdmin && (
            <Card>
              <CardTitle>Dados profissionais</CardTitle>
              <EditTherapistForm id={therapist.id} therapist={therapist} />
            </Card>
          )}
        </div>

        {canSeeDetails && (
          <div className="flex flex-col gap-5">
            <Card className="p-0">
              <div className="p-5 pb-0">
                <CardTitle>Pacientes vinculados</CardTitle>
              </div>
              {!assignments?.length ? (
                <EmptyState title="Nenhum paciente vinculado" icon="🧒" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Paciente</Th>
                      <Th>Terapia</Th>
                      <Th>Frequência</Th>
                      <Th>Desde</Th>
                      {scheduling && <Th />}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <Td className="font-semibold text-t1">
                          {assignment.patients && (
                            <Link href={`/patients/${assignment.patients.id}`} className="hover:text-primary">
                              {assignment.patients.full_name}
                            </Link>
                          )}
                        </Td>
                        <Td>{assignment.therapies?.name}</Td>
                        <Td>{assignment.frequency ?? "—"}</Td>
                        <Td>{formatDate(assignment.starts_on)}</Td>
                        {scheduling && (
                          <Td>
                            {assignment.patients &&
                              scheduling.assignments.some((item) => item.patientId === assignment.patients?.id && item.therapyId === assignment.therapy_id) && (
                                <NewAppointment
                                  trigger="📅 Agendar"
                                  triggerVariant="ghost"
                                  assignments={scheduling.assignments}
                                  rooms={scheduling.rooms}
                                  defaultDate={today}
                                  defaultPatientId={assignment.patients.id}
                                  defaultAssignment={`${id}:${assignment.therapy_id}`}
                                />
                              )}
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card>
              <CardTitle>Relatórios pendentes</CardTitle>
              {!reports?.length ? (
                <EmptyState title="Nenhuma pendência de relatório" icon="✅" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {reports.map((report) => (
                    <li key={report.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-xs font-semibold text-warn">
                      <span className="flex-1">
                        {REPORT_TYPE_LABELS[report.report_type]} · {report.reference_label} — {report.patients?.full_name}
                      </span>
                      {report.status === "returned" && <Badge tone="red">Devolvido</Badge>}
                      <span>{report.due_date ? `Prazo ${formatDate(report.due_date)}` : "Sem prazo"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-0" data-testid="therapist-rates">
              <div className="p-5 pb-0">
                <CardTitle>Valores de repasse</CardTitle>
                <div className="mb-4 grid gap-2 text-xs text-t2 sm:grid-cols-2">
                  <div className="rounded-lg bg-line-light px-3 py-2">
                    <b className="text-t1">Por sessão:</b> valor fixo por sessão realizada, independentemente da duração.
                  </div>
                  <div className="rounded-lg bg-line-light px-3 py-2">
                    <b className="text-t1">Por hora:</b> valor/hora proporcional à duração real da sessão (ex.: R$ 120/h × 50 min = R$ 100,00).
                  </div>
                </div>
              </div>
              {!rates?.length ? (
                <EmptyState title="Nenhum valor cadastrado" description="Sem valor vigente, as sessões não entram no cálculo da nota fiscal." icon="💰" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Terapia</Th>
                      <Th>Modelo</Th>
                      <Th>Valor</Th>
                      <Th>Vigente a partir de</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((rate) => (
                      <tr key={rate.id}>
                        <Td className="font-semibold text-t1">{rate.therapies?.name}</Td>
                        <Td>{PAY_MODEL_LABELS[rate.pay_model]}</Td>
                        <Td>
                          {formatCents(rate.amount_cents)}
                          {rate.pay_model === "per_hour" ? "/h" : "/sessão"}
                        </Td>
                        <Td>{formatDate(rate.valid_from)}</Td>
                        <Td>
                          {currentRateIds.has(rate.id) ? (
                            <Badge tone="green">Vigente</Badge>
                          ) : rate.valid_from > today ? (
                            <Badge tone="blue">Futuro</Badge>
                          ) : (
                            <Badge tone="gray">Anterior</Badge>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {isAdmin && (
                <div className="border-t border-line p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-t3">Novo valor</div>
                  <AddRateForm therapistId={therapist.id} therapies={therapies ?? []} today={today} />
                  <p className="text-[11px] text-t3">Um novo valor não altera o passado: cada sessão usa o valor vigente na data em que aconteceu.</p>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
