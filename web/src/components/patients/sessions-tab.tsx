import { createClient } from "@/lib/supabase/server";
import { durationMinutes, formatDateTime } from "@/lib/format";
import type { Database } from "@/lib/database.types";
import { Badge, Card, CardTitle, EmptyState, Table, Td, Th } from "@/components/ui/primitives";

type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export const APPOINTMENT_STATUS: Record<AppointmentStatus, { label: string; tone: "blue" | "green" | "gray" | "red" | "yellow" }> = {
  scheduled: { label: "Agendada", tone: "blue" },
  confirmed: { label: "Confirmada", tone: "green" },
  completed: { label: "Concluída", tone: "gray" },
  canceled: { label: "Cancelada", tone: "red" },
  no_show: { label: "Falta", tone: "yellow" },
};

const SELECT = "id, starts_at, ends_at, status, therapy:therapies (name), room:rooms (name), therapist:therapists (profile:profiles (full_name))";

export async function SessionsTab({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [upcoming, past] = await Promise.all([
    supabase.from("appointments").select(SELECT).eq("patient_id", patientId).gte("starts_at", now).order("starts_at").limit(30),
    supabase.from("appointments").select(SELECT).eq("patient_id", patientId).lt("starts_at", now).order("starts_at", { ascending: false }).limit(30),
  ]);

  return (
    <div className="grid gap-6">
      <SessionsTable title="Próximas sessões" rows={upcoming.data ?? []} empty="Nenhuma sessão agendada." />
      <SessionsTable title="Sessões anteriores" rows={past.data ?? []} empty="Nenhuma sessão realizada ainda." />
    </div>
  );
}

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  therapy: { name: string } | null;
  room: { name: string } | null;
  therapist: { profile: { full_name: string } | null } | null;
};

function SessionsTable({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle>{title}</CardTitle>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="📅" title={empty} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Terapeuta</Th>
              <Th>Terapia</Th>
              <Th>Sala</Th>
              <Th>Duração</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = APPOINTMENT_STATUS[row.status];
              return (
                <tr key={row.id} data-testid="session-row">
                  <Td className="font-semibold text-t1">{formatDateTime(row.starts_at)}</Td>
                  <Td>{row.therapist?.profile?.full_name ?? "—"}</Td>
                  <Td>{row.therapy?.name ?? "—"}</Td>
                  <Td>{row.room?.name ?? "—"}</Td>
                  <Td>{durationMinutes(row.starts_at, row.ends_at)} min</Td>
                  <Td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
