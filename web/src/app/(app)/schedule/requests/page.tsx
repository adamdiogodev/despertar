import Link from "next/link";
import { Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { RescheduleDecision } from "@/components/schedule/reschedule-decision";
import { ROLE_LABELS, STAFF_ROLES, requireRole } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const SELECT =
  "id, proposed_starts_at, reason, status, decision_note, decided_at, created_at, requester:profiles!reschedule_requests_requested_by_fkey(full_name, role), decider:profiles!reschedule_requests_decided_by_fkey(full_name), appointments(starts_at, patient_id, patients(full_name), therapies(name), therapists(profiles(full_name)))";

export default async function RescheduleRequestsPage() {
  await requireRole(STAFF_ROLES);
  const supabase = await createClient();
  const [pendingResult, decidedResult] = await Promise.all([
    supabase.from("reschedule_requests").select(SELECT).eq("status", "pending").order("created_at"),
    supabase.from("reschedule_requests").select(SELECT).neq("status", "pending").order("decided_at", { ascending: false }).limit(50),
  ]);
  if (pendingResult.error) throw new Error(pendingResult.error.message);
  const pending = pendingResult.data ?? [];
  const decided = decidedResult.data ?? [];

  return (
    <div>
      <PageHeader
        title="Solicitações de remarcação"
        description="Pedidos de famílias e equipe para mover sessões"
        actions={
          <LinkButton href="/schedule" variant="ghost" size="sm">
            ← Agenda
          </LinkButton>
        }
      />

      <Card className="mb-6">
        <CardTitle>Pendentes ({pending.length})</CardTitle>
        {pending.length === 0 ? (
          <EmptyState title="Nenhuma solicitação pendente" icon="✅" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="pending-requests">
            {pending.map((request) => {
              const appointment = request.appointments;
              return (
                <div key={request.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {appointment ? (
                        <Link href={`/patients/${appointment.patient_id}`} className="text-sm font-bold text-primary hover:underline">
                          {appointment.patients?.full_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-bold text-t1">Sessão removida</span>
                      )}
                      <div className="text-xs text-t3">
                        {appointment?.therapies?.name} · {appointment?.therapists?.profiles?.full_name}
                      </div>
                    </div>
                    <Badge tone="yellow">Pendente</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-t3">Sessão atual</div>
                      <div className="font-bold text-t1">{appointment ? formatDateTime(appointment.starts_at) : "—"}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-t3">Nova data proposta</div>
                      <div className="font-bold text-primary">{formatDateTime(request.proposed_starts_at)}</div>
                    </div>
                  </div>
                  <p className="mt-3 rounded-lg bg-line-light px-3 py-2 text-xs text-t2">“{request.reason}”</p>
                  <div className="mt-2 text-[11px] text-t3">
                    Pedido por {request.requester?.full_name ?? "—"}
                    {request.requester && ` (${ROLE_LABELS[request.requester.role]})`} · {formatRelative(request.created_at)}
                  </div>
                  <RescheduleDecision requestId={request.id} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardTitle>Histórico</CardTitle>
        </div>
        {decided.length === 0 ? (
          <EmptyState title="Nenhuma solicitação decidida ainda" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Paciente</Th>
                <Th>Data proposta</Th>
                <Th>Motivo</Th>
                <Th>Pedido por</Th>
                <Th>Decisão</Th>
                <Th>Observação</Th>
              </tr>
            </thead>
            <tbody>
              {decided.map((request) => (
                <tr key={request.id}>
                  <Td className="font-semibold text-t1">{request.appointments?.patients?.full_name ?? "—"}</Td>
                  <Td>{formatDateTime(request.proposed_starts_at)}</Td>
                  <Td className="max-w-xs truncate">{request.reason}</Td>
                  <Td>{request.requester?.full_name ?? "—"}</Td>
                  <Td>
                    <Badge tone={request.status === "approved" ? "green" : "red"}>{request.status === "approved" ? "Aprovada" : "Recusada"}</Badge>
                    <div className="mt-1 text-[11px] text-t3">
                      {request.decider?.full_name ?? "—"} · {formatDateTime(request.decided_at)}
                    </div>
                  </Td>
                  <Td>{request.decision_note || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
