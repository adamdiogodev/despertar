import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelative } from "@/lib/format";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { ChatView } from "@/components/chat/chat-view";
import { RequestForm } from "./request-form";
import { REQUEST_STATUS, REQUEST_TYPE_LABELS } from "./labels";

export default async function PortalMessagesPage({ searchParams }: PageProps<"/portal/messages">) {
  const user = await requireRole(["guardian"]);
  const { c } = await searchParams;
  const supabase = await createClient();

  const [{ data: announcements }, { data: patients }, { data: requests }] = await Promise.all([
    supabase.from("announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("patients").select("id, full_name").order("full_name"),
    supabase
      .from("guardian_requests")
      .select("id, request_type, message, status, response, responded_at, created_at, patient:patients(full_name)")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <>
      <PageHeader title="Recados" description="Converse com a equipe e os terapeutas, e acompanhe suas solicitações" />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <ChatView user={user} basePath="/portal/messages" selectedId={typeof c === "string" ? c : undefined} />

        <div className="grid content-start gap-5">
          <Card>
            <CardTitle>Comunicados da clínica</CardTitle>
            {!announcements?.length && <p className="text-xs text-t3">Nenhum comunicado no momento.</p>}
            <ul className="grid gap-3" data-testid="portal-announcements">
              {announcements?.map((announcement) => (
                <li key={announcement.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-sm text-t1">
                      <b>{announcement.title}</b>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-t2">{announcement.body}</p>
                    <div className="text-[10px] text-t3">{formatRelative(announcement.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Enviar solicitação</CardTitle>
            <RequestForm patients={patients ?? []} />
          </Card>

          <Card>
            <CardTitle>Minhas solicitações</CardTitle>
            {!requests?.length && <p className="text-xs text-t3">Você ainda não enviou solicitações.</p>}
            <ul className="grid gap-3" data-testid="guardian-request-list">
              {requests?.map((request) => {
                const status = REQUEST_STATUS[request.status];
                return (
                  <li key={request.id} className="rounded-lg border border-line-light p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-t1">
                        {REQUEST_TYPE_LABELS[request.request_type]}
                        {request.patient?.full_name && <span className="font-normal text-t3"> · {request.patient.full_name}</span>}
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-t2">{request.message}</p>
                    <div className="mt-1 text-[10px] text-t3">Enviada em {formatDate(request.created_at)}</div>
                    {request.response && (
                      <div className="mt-2 rounded-md bg-ok-bg px-3 py-2 text-xs text-t1">
                        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ok">
                          Resposta da clínica{request.responded_at && ` · ${formatDate(request.responded_at)}`}
                        </div>
                        <p className="whitespace-pre-wrap">{request.response}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
