import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, formatDate, formatRelative, formatTime, localDateKey } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, EmptyState, StatCard } from "@/components/ui/primitives";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { loadPortalChildren } from "@/components/portal/data";
import { financeSituation, withChild } from "@/components/portal/rules";

const SITUATION = {
  up_to_date: { label: "Em dia ✓", tone: "green" },
  pending: { label: "Pendente", tone: "yellow" },
  overdue: { label: "Atrasado", tone: "red" },
} as const;

export default async function PortalHomePage({ searchParams }: PageProps<"/portal">) {
  const user = await requireRole(["guardian"]);
  const { child } = await searchParams;
  const { children, selectedId, patientIds, familyIds } = await loadPortalChildren(child);
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const today = localDateKey(new Date());

  const [nextSession, signatures, participations, charges, announcements, guidance, awaitingConfirmation] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, rooms(name), therapies(name), therapists(profiles(full_name)), patients(full_name)")
      .in("patient_id", patientIds)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", nowIso)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("signature_requests").select("id", { count: "exact", head: true }).eq("signer_id", user.id).eq("status", "pending"),
    supabase.from("conversation_participants").select("last_read_at, conversations(last_message_at)").eq("profile_id", user.id),
    supabase.from("charges").select("status, due_date").in("family_id", familyIds).neq("status", "canceled"),
    supabase.from("announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(4),
    Promise.all(
      patientIds.map(async (patientId) => {
        const { data } = await supabase.rpc("get_family_guidance", { target_patient: patientId });
        return { patientId, items: data ?? [] };
      }),
    ),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("patient_id", patientIds)
      .eq("status", "completed")
      .is("family_confirmation", null),
  ]);
  const awaitingCount = awaitingConfirmation.count ?? 0;

  const unread = (participations.data ?? []).filter((p) => {
    const last = p.conversations?.last_message_at;
    return last && (!p.last_read_at || new Date(last) > new Date(p.last_read_at));
  }).length;
  const chargeRows = charges.data ?? [];
  const situation = SITUATION[financeSituation(chargeRows, today)];
  const nextDue = chargeRows
    .filter((c) => c.status === "pending" || c.status === "awaiting_insurance")
    .map((c) => c.due_date)
    .sort()[0];
  const session = nextSession.data;
  const visibleChildren = children.filter((c) => patientIds.includes(c.id));
  const link = (href: string) => withChild(href, selectedId);
  const firstName = user.fullName.split(" ")[0];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-card bg-gradient-to-r from-primary to-primary-dark p-6 text-white shadow-card">
        <Avatar name={user.fullName} color="rgba(255,255,255,0.25)" size={56} />
        <div>
          <h1 className="text-xl font-extrabold">Olá, {firstName}! 👋</h1>
          <p className="mt-1 text-sm text-white/85">
            {children.length === 0
              ? "Seja bem-vindo(a) à área da família."
              : `Responsável por ${children.map((c) => c.fullName).join(", ")}`}
          </p>
        </div>
      </div>

      <ChildSwitcher items={children} selectedId={selectedId} basePath="/portal" />

      {awaitingCount > 0 && (
        <Link
          href={`${link("/portal/sessions")}#pending-confirmation`}
          className="mb-6 flex flex-wrap items-center gap-3 rounded-card border border-warn bg-warn-bg px-5 py-4 shadow-card transition hover:brightness-95"
          data-testid="awaiting-confirmation-card"
        >
          <span className="text-2xl">✋</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-t1">
              {awaitingCount} {awaitingCount === 1 ? "sessão aguardando" : "sessões aguardando"} seu de acordo
            </div>
            <div className="text-sm text-t2">Veja o registro do terapeuta e confirme se a sessão foi realizada.</div>
          </div>
          <span className="text-sm font-semibold text-primary">Responder →</span>
        </Link>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Próxima sessão"
          tone="blue"
          icon="📅"
          href={link("/portal/sessions")}
          value={session ? `${formatDate(session.starts_at).slice(0, 5)} · ${formatTime(session.starts_at)}` : "—"}
          hint={
            session
              ? [session.therapists?.profiles?.full_name, session.rooms?.name, visibleChildren.length > 1 ? session.patients?.full_name : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Nenhuma sessão agendada"
          }
        />
        <StatCard
          label="Documentos"
          tone="yellow"
          icon="📄"
          href={link("/portal/documents")}
          value={signatures.count ?? 0}
          hint="Aguardando sua assinatura"
        />
        <StatCard
          label="Recados"
          tone="purple"
          icon="💬"
          href={link("/portal/messages")}
          value={unread}
          hint={unread === 1 ? "Conversa com mensagem nova" : unread > 1 ? "Conversas com mensagens novas" : "Tudo lido"}
        />
        <StatCard
          label="Situação financeira"
          tone={situation.tone}
          icon="💰"
          href={link("/portal/finance")}
          value={situation.label}
          hint={
            !nextDue ? "Nenhuma cobrança em aberto" : nextDue < today ? `Em atraso desde ${formatDate(nextDue)}` : `Próximo vencimento: ${formatDate(nextDue)}`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle action={<Link href={link("/portal/profile")} className="text-xs font-semibold text-primary hover:underline">Ver perfil</Link>}>
              {visibleChildren.length > 1 ? "Minhas crianças" : "Sobre o atendimento"}
            </CardTitle>
            {visibleChildren.length === 0 ? (
              <EmptyState icon="🧒" title="Nenhuma criança vinculada" description="Fale com a recepção da clínica para concluir o cadastro." />
            ) : (
              <div className="space-y-4">
                {visibleChildren.map((c) => {
                  const age = ageFrom(c.birthDate);
                  return (
                    <div key={c.id} className="rounded-lg border border-line-light p-4" data-testid="portal-child">
                      <div className="mb-2 flex items-center gap-3">
                        <Avatar name={c.fullName} size={40} />
                        <div>
                          <div className="font-bold text-t1">{c.fullName}</div>
                          <div className="text-xs text-t3">{age != null ? `${age} ${age === 1 ? "ano" : "anos"}` : "Idade não informada"}</div>
                        </div>
                      </div>
                      {c.assignments.length === 0 ? (
                        <p className="text-sm text-t3">Nenhuma terapia ativa no momento.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {c.assignments.map((a) => (
                            <li key={a.id}>
                              <Badge tone="blue">
                                {a.therapy} · {a.therapistName}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>🏡 Orientações para casa</CardTitle>
            {guidance.every((g) => g.items.length === 0) ? (
              <EmptyState icon="🌱" title="Nenhuma orientação no momento" description="Quando os terapeutas compartilharem atividades para fazer em casa, elas aparecem aqui." />
            ) : (
              <div className="space-y-4">
                {guidance.flatMap((g) =>
                  g.items.map((item, index) => (
                    <div key={`${g.patientId}-${index}`} className="rounded-lg bg-ok-bg/50 p-4">
                      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ok">
                        {item.therapy} · {item.therapist_name}
                        {visibleChildren.length > 1 && ` · ${children.find((c) => c.id === g.patientId)?.fullName.split(" ")[0]}`}
                      </div>
                      {item.home_guidance && <p className="whitespace-pre-line text-sm text-t1">{item.home_guidance}</p>}
                      {item.materials && (
                        <p className="mt-2 text-xs text-t2">
                          <span className="font-semibold">Materiais:</span> {item.materials}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-t3">Atualizado {formatRelative(item.updated_at)}</p>
                    </div>
                  )),
                )}
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardTitle>📢 Comunicados da clínica</CardTitle>
          {(announcements.data ?? []).length === 0 ? (
            <EmptyState icon="📭" title="Nenhum comunicado" />
          ) : (
            <ul className="space-y-4">
              {(announcements.data ?? []).map((a) => (
                <li key={a.id} className="border-l-2 border-primary pl-3">
                  <div className="text-sm font-bold text-t1">{a.title}</div>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-t2">{a.body}</p>
                  <div className="mt-1 text-[11px] text-t3">{formatRelative(a.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
