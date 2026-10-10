import Link from "next/link";
import { CalendarDays, FileText, HeartHandshake, MessageCircle, Receipt, Repeat, Users, Wallet } from "lucide-react";
import { MANAGER_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatDate, formatTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { WeeklySessionsChart } from "@/components/dashboard/weekly-sessions-chart";

const STATUS_BADGE = {
  scheduled: { label: "Agendada", tone: "blue" },
  confirmed: { label: "Confirmada", tone: "green" },
  completed: { label: "Concluída", tone: "gray" },
  canceled: { label: "Cancelada", tone: "red" },
  no_show: { label: "Falta", tone: "yellow" },
} as const;

function startOfWeek(date: Date) {
  const local = new Date(`${localDateKey(date)}T12:00:00Z`);
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  local.setUTCDate(local.getUTCDate() - day);
  return local;
}

function isoAtLocalMidnight(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00-03:00`).toISOString();
}

export default async function DashboardPage() {
  const user = await requireRole(TEAM_ROLES);
  const supabase = await createClient();
  const isManager = MANAGER_ROLES.includes(user.role);
  const isTherapist = user.role === "therapist";

  const now = new Date();
  const today = localDateKey(now);
  const weekStart = startOfWeek(now);
  const chartStart = new Date(weekStart);
  chartStart.setUTCDate(chartStart.getUTCDate() - 7 * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  let appointmentsQuery = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, therapist_id, patients(full_name), therapies(name), rooms(name), therapists(color, profiles(full_name))")
    .gte("starts_at", isoAtLocalMidnight(chartStart))
    .lt("starts_at", isoAtLocalMidnight(weekEnd))
    .order("starts_at");
  if (isTherapist) appointmentsQuery = appointmentsQuery.eq("therapist_id", user.id);

  const [appointments, announcement, reports, tasks, participants, reschedules, requests, families, invoices, charges, patients] =
    await Promise.all([
      appointmentsQuery,
      supabase.from("announcements").select("title, body").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("reports").select("id, status, due_date, reference_label, patients(full_name)").in("status", ["pending", "returned", "in_review"]),
      supabase
        .from("tasks")
        .select("id, title, priority, due_date")
        .eq("assigned_to", user.id)
        .eq("status", "open")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(6),
      supabase.from("conversation_participants").select("last_read_at, conversations(last_message_at)").eq("profile_id", user.id),
      isTherapist ? Promise.resolve({ count: 0 }) : supabase.from("reschedule_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      isTherapist ? Promise.resolve({ count: 0 }) : supabase.from("guardian_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("families").select("id", { count: "exact", head: true }).eq("status", "active"),
      isManager || isTherapist
        ? supabase.from("invoice_requests").select("amount_cents, status").in("status", ["requested", "submitted", "approved", "rejected"])
        : Promise.resolve({ data: [] }),
      isManager ? supabase.from("charges").select("amount_cents, due_date, status").eq("status", "pending") : Promise.resolve({ data: [] }),
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);

  const allAppointments = appointments.data ?? [];
  const thisWeek = allAppointments.filter((a) => new Date(a.starts_at) >= new Date(isoAtLocalMidnight(weekStart)));
  const todays = allAppointments.filter((a) => localDateKey(a.starts_at) === today && a.status !== "canceled");

  const weeks = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(chartStart);
    start.setUTCDate(start.getUTCDate() + index * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const count = allAppointments.filter(
      (a) => a.status === "completed" && new Date(a.starts_at) >= new Date(isoAtLocalMidnight(start)) && new Date(a.starts_at) < new Date(isoAtLocalMidnight(end)),
    ).length;
    return { label: `${String(start.getUTCDate()).padStart(2, "0")}/${String(start.getUTCMonth() + 1).padStart(2, "0")}`, count };
  });

  const openReports = (reports.data ?? []).filter((r) => (isTherapist ? r.status !== "in_review" : true));
  const inReview = (reports.data ?? []).filter((r) => r.status === "in_review").length;
  const unreadConversations = (participants.data ?? []).filter((p) => {
    const last = p.conversations?.last_message_at;
    return last && (!p.last_read_at || new Date(last) > new Date(p.last_read_at));
  }).length;
  const pendingPayouts = (invoices.data ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const myInvoicesToIssue = (invoices.data ?? []).filter((i) => i.status === "requested" || i.status === "rejected").length;
  const overdue = (charges.data ?? []).filter((c) => c.due_date < today);
  const overdueTotal = overdue.reduce((sum, c) => sum + c.amount_cents, 0);
  const toConfirm = thisWeek.filter((a) => a.status === "scheduled" && new Date(a.starts_at) > now).length;

  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(now));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const longDate = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PageHeader title="Visão Geral" description={`${greeting}, ${user.fullName.split(" ")[0]} — ${longDate}`} />

      {announcement.data && (
        <Alert tone="blue">
          📌 <strong>{announcement.data.title}:</strong> {announcement.data.body}
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isTherapist ? (
          <>
            <StatCard label="Meus pacientes" value={patients.count ?? 0} hint="com vínculo ativo" icon={<Users size={18} />} href="/patients" />
            <StatCard label="Sessões na semana" value={thisWeek.filter((a) => a.status !== "canceled").length} hint={`${toConfirm} a confirmar`} tone="green" icon={<CalendarDays size={18} />} href="/schedule" />
            <StatCard label="Relatórios pendentes" value={openReports.length} hint="para enviar" tone="yellow" icon={<FileText size={18} />} href="/reports" />
            <StatCard label="Notas fiscais a emitir" value={myInvoicesToIssue} hint="solicitadas pela clínica" tone="purple" icon={<Receipt size={18} />} href="/invoices" />
          </>
        ) : (
          <>
            <StatCard label="Famílias ativas" value={families.count ?? 0} hint={`${patients.count ?? 0} pacientes ativos`} icon={<HeartHandshake size={18} />} href="/families" />
            <StatCard label="Atendimentos na semana" value={thisWeek.filter((a) => a.status !== "canceled").length} hint={`${toConfirm} a confirmar`} tone="green" icon={<CalendarDays size={18} />} href="/schedule" />
            {isManager ? (
              <>
                <StatCard label="Relatórios" value={openReports.length - inReview} hint={`${inReview} aguardando revisão`} tone="yellow" icon={<FileText size={18} />} href="/reports" />
                <StatCard label="Repasses em aberto" value={formatCents(pendingPayouts)} hint="notas fiscais a pagar/emitir" tone="purple" icon={<Receipt size={18} />} href="/finance/invoices" />
              </>
            ) : (
              <>
                <StatCard label="Remarcações pendentes" value={reschedules.count ?? 0} tone="yellow" icon={<Repeat size={18} />} href="/schedule/requests" />
                <StatCard label="Solicitações das famílias" value={requests.count ?? 0} tone="purple" icon={<MessageCircle size={18} />} href="/families/requests" />
              </>
            )}
          </>
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Conversas não lidas" value={unreadConversations} tone="blue" icon={<MessageCircle size={18} />} href="/messages" />
        {isManager && (
          <>
            <StatCard label="Remarcações pendentes" value={reschedules.count ?? 0} tone="yellow" icon={<Repeat size={18} />} href="/schedule/requests" />
            <StatCard label="Solicitações das famílias" value={requests.count ?? 0} tone="purple" icon={<HeartHandshake size={18} />} href="/families/requests" />
            <StatCard label="Inadimplência" value={formatCents(overdueTotal)} hint={`${overdue.length} cobrança(s) vencida(s)`} tone="red" icon={<Wallet size={18} />} href="/finance" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardTitle>Sessões realizadas por semana</CardTitle>
            <WeeklySessionsChart weeks={weeks} />
          </Card>
          <Card className="p-0">
            <div className="px-5 pt-5">
              <CardTitle action={<Link href="/schedule" className="text-xs font-semibold text-primary">Ver agenda →</Link>}>Agenda de hoje</CardTitle>
            </div>
            {todays.length === 0 && <EmptyState icon="📅" title="Nenhuma sessão hoje" />}
            {todays.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-t border-line-light px-5 py-3">
                <div className="h-9 w-1 rounded-full" style={{ background: a.therapists?.color ?? "#2E86DE" }} />
                <div className="w-24 text-sm font-bold text-t1">
                  {formatTime(a.starts_at)}–{formatTime(a.ends_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-t1">{a.patients?.full_name}</div>
                  <div className="truncate text-xs text-t3">
                    {a.therapies?.name} · {a.therapists?.profiles?.full_name} · {a.rooms?.name ?? "Sem sala"}
                  </div>
                </div>
                <Badge tone={STATUS_BADGE[a.status].tone}>{STATUS_BADGE[a.status].label}</Badge>
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle action={<Link href="/tasks" className="text-xs font-semibold text-primary">Todas →</Link>}>Minhas tarefas</CardTitle>
            {!tasks.data?.length && <div className="py-4 text-center text-xs text-t3">Nenhuma tarefa aberta.</div>}
            {tasks.data?.map((task) => (
              <div key={task.id} className="flex items-start justify-between gap-3 border-b border-line-light py-2.5 last:border-0">
                <div className="text-sm text-t1">{task.title}</div>
                <div className="shrink-0 text-right">
                  {task.priority === "urgent" && <Badge tone="red">Urgente</Badge>}
                  {task.due_date && <div className="mt-0.5 text-[11px] text-t3">{formatDate(task.due_date)}</div>}
                </div>
              </div>
            ))}
          </Card>
          {(isManager || isTherapist) && (
            <Card>
              <CardTitle action={<Link href="/reports" className="text-xs font-semibold text-primary">Relatórios →</Link>}>Prazos de relatórios</CardTitle>
              {!openReports.length && <div className="py-4 text-center text-xs text-t3">Nenhum relatório pendente.</div>}
              {openReports
                .filter((r) => r.status !== "in_review")
                .sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"))
                .slice(0, 6)
                .map((report) => {
                  const late = report.due_date && report.due_date <= today;
                  return (
                    <div key={report.id} className="flex items-center justify-between gap-3 border-b border-line-light py-2.5 last:border-0">
                      <div>
                        <div className="text-sm font-semibold text-t1">{report.patients?.full_name}</div>
                        <div className="text-xs text-t3">{report.reference_label}</div>
                      </div>
                      <div className={late ? "text-xs font-bold text-danger" : "text-xs text-t2"}>
                        {report.status === "returned" ? <Badge tone="red">Devolvido</Badge> : formatDate(report.due_date)}
                      </div>
                    </div>
                  );
                })}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
