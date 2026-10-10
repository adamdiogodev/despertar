import Link from "next/link";
import { STAFF_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { REQUEST_STATUS, REQUEST_TYPE_LABELS } from "@/components/admin/labels";
import { RequestActions } from "./request-actions";

export const metadata = { title: "Solicitações das famílias — Sistema Despertar" };

const FILTERS = ["open", "answered", "closed", "all"] as const;
type Filter = (typeof FILTERS)[number];

export default async function GuardianRequestsPage({ searchParams }: PageProps<"/families/requests">) {
  await requireRole(STAFF_ROLES);
  const { status } = await searchParams;
  const filter: Filter = FILTERS.includes(status as Filter) ? (status as Filter) : "open";

  const supabase = await createClient();
  let query = supabase
    .from("guardian_requests")
    .select(
      "id, request_type, message, status, response, responded_at, created_at, family_id, families(name), patients(full_name), requester:profiles!guardian_requests_requested_by_fkey(full_name), responder:profiles!guardian_requests_responded_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") query = query.eq("status", filter);
  const { data: requests } = await query;

  const { count: openCount } = await supabase.from("guardian_requests").select("id", { count: "exact", head: true }).eq("status", "open");

  return (
    <>
      <PageHeader title="Solicitações das famílias" description="Pedidos enviados pelos responsáveis pelo Portal da Família" />
      <Tabs
        active={filter}
        tabs={[
          { key: "open", label: `Abertas${openCount ? ` (${openCount})` : ""}`, href: "/families/requests?status=open" },
          { key: "answered", label: "Respondidas", href: "/families/requests?status=answered" },
          { key: "closed", label: "Encerradas", href: "/families/requests?status=closed" },
          { key: "all", label: "Todas", href: "/families/requests?status=all" },
        ]}
      />

      {!requests?.length ? (
        <Card>
          <EmptyState title="Nenhuma solicitação aqui" description="Quando uma família enviar um pedido pelo portal, ele aparece nesta caixa." icon="📬" />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="request-list">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={REQUEST_STATUS[request.status].tone}>{REQUEST_STATUS[request.status].label}</Badge>
                      <Badge tone="purple">{REQUEST_TYPE_LABELS[request.request_type]}</Badge>
                      <span className="text-xs text-t3" title={formatDateTime(request.created_at)}>
                        {formatRelative(request.created_at)}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-t1">
                      {request.requester?.full_name ?? "Responsável"} ·{" "}
                      <Link href={`/families/${request.family_id}`} className="text-primary hover:underline">
                        {request.families?.name}
                      </Link>
                      {request.patients && <span className="font-normal text-t3"> · sobre {request.patients.full_name}</span>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-t2">{request.message}</p>
                    {request.response && (
                      <div className="mt-3 rounded-lg bg-info-bg px-3 py-2 text-sm text-t1">
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-info">
                          Resposta{request.responder ? ` de ${request.responder.full_name}` : ""}
                          {request.responded_at ? ` · ${formatDateTime(request.responded_at)}` : ""}
                        </div>
                        <p className="whitespace-pre-wrap">{request.response}</p>
                      </div>
                    )}
                  </div>
                  <RequestActions id={request.id} canAnswer={request.status !== "closed"} currentResponse={request.response} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
