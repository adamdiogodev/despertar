import { requireRole, MANAGER_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, localDateKey } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, LinkButton, PageHeader, Table, Td, Th, buttonClass, cn } from "@/components/ui/primitives";
import { ActionButton } from "@/components/documents/action-button";
import { RequestSignatureModal, type GuardianOption, type SignableDocument } from "@/components/documents/request-signature-modal";
import { cancelSignatureRequest, requestSignature, signDocument } from "./actions";

type SignatureRow = {
  id: string;
  status: "pending" | "signed" | "canceled";
  due_date: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  created_at: string;
  signer_id: string;
  requested_by: string | null;
  document: { id: string; title: string; file_path: string } | null;
  signer: { full_name: string; role: AppRole } | null;
  requester: { full_name: string } | null;
};

const SELECT =
  "id, status, due_date, signed_at, signer_ip, signer_user_agent, created_at, signer_id, requested_by, " +
  "document:documents(id, title, file_path), signer:profiles!signature_requests_signer_id_fkey(full_name, role), " +
  "requester:profiles!signature_requests_requested_by_fkey(full_name)";

const STATUS_BADGE = {
  pending: <Badge tone="yellow">Pendente</Badge>,
  signed: <Badge tone="green">Assinado</Badge>,
  canceled: <Badge>Cancelado</Badge>,
};

function fileHref(path: string) {
  return `/files?path=${encodeURIComponent(path)}`;
}

export default async function SignaturesPage() {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const isManager = MANAGER_ROLES.includes(user.role);
  const supabase = await createClient();
  const today = localDateKey(new Date());

  const [{ data: mineData, error }, tracking] = await Promise.all([
    supabase.from("signature_requests").select(SELECT).eq("signer_id", user.id).neq("status", "canceled").order("created_at", { ascending: false }),
    isManager
      ? Promise.all([
          supabase.from("signature_requests").select(SELECT).order("created_at", { ascending: false }).limit(200),
          supabase.from("documents").select("id, title, family_id, family:families(name)").order("created_at", { ascending: false }).limit(500),
          supabase.from("guardians").select("profile_id, family_id, profile:profiles(full_name, active)"),
          supabase.from("therapists").select("id, profile:profiles(full_name, active)"),
        ])
      : null,
  ]);
  if (error) throw new Error(error.message);
  const mine = (mineData ?? []) as unknown as SignatureRow[];
  const myPending = mine.filter((r) => r.status === "pending");

  let requests: SignatureRow[] = [];
  let documents: SignableDocument[] = [];
  let guardians: GuardianOption[] = [];
  let therapists: { id: string; name: string }[] = [];
  if (tracking) {
    const [reqRes, docRes, guardianRes, therapistRes] = tracking;
    requests = (reqRes.data ?? []) as unknown as SignatureRow[];
    documents = (docRes.data ?? []).map((d) => ({ id: d.id, title: d.title, familyId: d.family_id, familyName: d.family?.name ?? null }));
    guardians = (guardianRes.data ?? [])
      .filter((g) => g.profile?.active)
      .map((g) => ({ id: g.profile_id, name: g.profile!.full_name, familyId: g.family_id }));
    therapists = (therapistRes.data ?? [])
      .filter((t) => t.profile?.active)
      .map((t) => ({ id: t.id, name: t.profile!.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  return (
    <div>
      <PageHeader
        title="Assinaturas"
        description="Documentos para assinar e acompanhamento das solicitações"
        actions={
          <>
            <LinkButton href="/documents" variant="ghost" size="sm">
              ← Documentos
            </LinkButton>
            {isManager && <RequestSignatureModal action={requestSignature} documents={documents} guardians={guardians} therapists={therapists} />}
          </>
        }
      />

      <Alert tone="blue">
        A assinatura aqui é um <strong>aceite eletrônico</strong> com trilha de auditoria (data e hora, endereço IP e dispositivo/navegador registrados no
        momento do aceite). Não é uma assinatura com certificado digital ICP-Brasil.
      </Alert>

      <Card className="mb-6">
        <CardTitle>Para eu assinar {myPending.length > 0 && <Badge tone="yellow">{myPending.length}</Badge>}</CardTitle>
        {mine.length === 0 ? (
          <EmptyState icon="✍" title="Nenhum documento aguardando sua assinatura" />
        ) : (
          <ul className="divide-y divide-line-light">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="my-signature">
                <div>
                  <div className="text-sm font-semibold text-t1">{r.document?.title ?? "Documento"}</div>
                  <div className="text-xs text-t3">
                    Solicitado por {r.requester?.full_name ?? "—"} em {formatDate(r.created_at)}
                    {r.due_date && (
                      <span className={cn(r.status === "pending" && r.due_date < today && "font-bold text-danger")}> · prazo {formatDate(r.due_date)}</span>
                    )}
                    {r.status === "signed" && <> · assinado em {formatDateTime(r.signed_at)}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.document && (
                    <a href={fileHref(r.document.file_path)} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                      📄 Ver documento
                    </a>
                  )}
                  {r.status === "pending" ? (
                    <ActionButton
                      action={signDocument}
                      fields={{ requestId: r.id }}
                      label="✍ Assinar"
                      variant="primary"
                      pendingLabel="Assinando..."
                      confirmMessage="Confirmo que li o documento e concordo com seu conteúdo. Registrar meu aceite eletrônico?"
                      testId="sign-document"
                    />
                  ) : (
                    STATUS_BADGE[r.status]
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isManager && (
        <Card className="p-0">
          <div className="p-5 pb-0">
            <CardTitle>Solicitações de assinatura</CardTitle>
          </div>
          {requests.length === 0 ? (
            <EmptyState title="Nenhuma solicitação feita" description="Use “Solicitar assinatura” para enviar um documento a um responsável ou terapeuta." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Documento</Th>
                  <Th>Signatário</Th>
                  <Th>Solicitado por</Th>
                  <Th>Prazo</Th>
                  <Th>Status</Th>
                  <Th>Assinado em</Th>
                  <Th>IP / dispositivo</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} data-testid="signature-request-row">
                    <Td className="font-semibold text-t1">
                      {r.document ? (
                        <a href={fileHref(r.document.file_path)} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                          {r.document.title}
                        </a>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {r.signer?.full_name ?? "—"}
                      {r.signer && <div className="text-[11px] text-t3">{ROLE_LABELS[r.signer.role]}</div>}
                    </Td>
                    <Td>{r.requester?.full_name ?? "—"}</Td>
                    <Td className={cn(r.status === "pending" && r.due_date && r.due_date < today && "font-bold text-danger")}>{formatDate(r.due_date)}</Td>
                    <Td>{STATUS_BADGE[r.status]}</Td>
                    <Td>{r.signed_at ? formatDateTime(r.signed_at) : "—"}</Td>
                    <Td className="max-w-56 text-xs">
                      {r.signer_ip ?? "—"}
                      {r.signer_user_agent && (
                        <div className="truncate text-[11px] text-t3" title={r.signer_user_agent}>
                          {r.signer_user_agent}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {r.status === "pending" && (
                        <ActionButton
                          action={cancelSignatureRequest}
                          fields={{ requestId: r.id }}
                          label="Cancelar"
                          variant="ghost"
                          confirmMessage="Cancelar esta solicitação de assinatura?"
                          testId="cancel-signature"
                        />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
