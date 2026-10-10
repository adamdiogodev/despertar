import Link from "next/link";
import { requireRole, MANAGER_ROLES, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCEPT_ATTRIBUTE } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, buttonClass, cn } from "@/components/ui/primitives";
import { ActionButton } from "@/components/documents/action-button";
import { UploadDocumentModal } from "@/components/documents/upload-document-modal";
import {
  DOCUMENT_CATEGORY_ICONS,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  formatBytes,
  isDocumentCategory,
  type DocumentCategory,
} from "@/components/documents/document-utils";
import { deleteDocument, releaseDocument, uploadDocument } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole(["admin", "coordination", "therapist"]);
  const isManager = MANAGER_ROLES.includes(user.role);
  const params = await searchParams;
  const category = isDocumentCategory(param(params.category)) ? (param(params.category) as DocumentCategory) : undefined;
  const familyParam = param(params.family);
  const familyId = familyParam && UUID.test(familyParam) ? familyParam : undefined;
  const q = (param(params.q) ?? "").trim().slice(0, 100);

  const supabase = await createClient();

  let docsQuery = supabase
    .from("documents")
    .select(
      "id, title, file_path, size_bytes, category, status, visible_to_family, uploaded_by, created_at, " +
        "family:families(name), patient:patients(full_name), uploader:profiles!documents_uploaded_by_fkey(full_name, role)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (category) docsQuery = docsQuery.eq("category", category);
  if (familyId) docsQuery = docsQuery.eq("family_id", familyId);
  if (q) docsQuery = docsQuery.ilike("title", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const [{ data: docData, error }, { data: families }, { data: patients }, pendingSignatures] = await Promise.all([
    docsQuery,
    supabase.from("families").select("id, name").order("name"),
    supabase.from("patients").select("id, full_name").order("full_name"),
    isManager
      ? supabase
          .from("signature_requests")
          .select("id, signer:profiles!signature_requests_signer_id_fkey!inner(role)", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("signer.role", "guardian")
      : Promise.resolve({ count: 0 }),
  ]);
  if (error) throw new Error(error.message);

  type DocRow = {
    id: string;
    title: string;
    file_path: string;
    size_bytes: number | null;
    category: DocumentCategory;
    status: keyof typeof DOCUMENT_STATUS_LABELS;
    visible_to_family: boolean;
    uploaded_by: string | null;
    created_at: string;
    family: { name: string } | null;
    patient: { full_name: string } | null;
    uploader: { full_name: string; role: keyof typeof ROLE_LABELS } | null;
  };
  const docs = (docData ?? []) as unknown as DocRow[];
  const familyName = familyId ? families?.find((f) => f.id === familyId)?.name : undefined;
  const pendingCount = pendingSignatures.count ?? 0;

  const navHref = (next: { category?: string; family?: string }) => {
    const search = new URLSearchParams({ ...(next.category && { category: next.category }), ...(next.family && { family: next.family }) });
    const s = search.toString();
    return s ? `/documents?${s}` : "/documents";
  };
  const navItem = (href: string, label: string, active: boolean, indent = false) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "block truncate rounded-md px-3 py-1.5 text-sm transition-colors",
        indent && "pl-6",
        active ? "bg-primary-light font-semibold text-primary" : "text-t2 hover:bg-line-light",
      )}
    >
      {label}
    </Link>
  );

  const breadcrumb = category
    ? `${DOCUMENT_CATEGORY_ICONS[category]} ${DOCUMENT_CATEGORY_LABELS[category]}`
    : familyName
      ? `📂 ${familyName}`
      : "📁 Todos os arquivos";

  return (
    <div>
      <PageHeader
        title="Documentos"
        description="Contratos, anamneses, laudos e arquivos das famílias"
        actions={
          <>
            <LinkButton href="/documents/signatures" variant="outline" size="sm">
              ✍ Assinaturas
            </LinkButton>
            <UploadDocumentModal
              action={uploadDocument}
              families={(families ?? []).map((f) => ({ id: f.id, name: f.name }))}
              patients={(patients ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
              allowInternal={user.role !== "therapist"}
              accept={ACCEPT_ATTRIBUTE}
            />
          </>
        }
      />

      {isManager && pendingCount > 0 && (
        <Alert tone="yellow">
          ⚠️ {pendingCount} documento(s) aguardando assinatura das famílias.{" "}
          <Link href="/documents/signatures" className="underline">
            Ver agora
          </Link>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <Card className="h-fit p-3">
          <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-t3">Estrutura</div>
          {navItem("/documents", "📁 Todos os arquivos", !category && !familyId)}
          <div className="mt-3 mb-1 px-3 text-[11px] font-bold uppercase tracking-wide text-t3">Categorias</div>
          {(Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]).map((c) =>
            navItem(navHref({ category: c }), `${DOCUMENT_CATEGORY_ICONS[c]} ${DOCUMENT_CATEGORY_LABELS[c]}`, category === c),
          )}
          {(families ?? []).length > 0 && (
            <>
              <div className="mt-3 mb-1 px-3 text-[11px] font-bold uppercase tracking-wide text-t3">Famílias</div>
              {(families ?? []).map((f) => navItem(navHref({ family: f.id }), `📂 ${f.name}`, familyId === f.id))}
            </>
          )}
        </Card>

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div className="text-sm font-bold text-t1">{breadcrumb}</div>
            <form action="/documents" className="flex items-center gap-2">
              {category && <input type="hidden" name="category" value={category} />}
              {familyId && <input type="hidden" name="family" value={familyId} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="🔍 Buscar arquivo..."
                className="w-52 rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
                data-testid="documents-search"
              />
              <button type="submit" className={buttonClass("ghost", "sm")}>
                Buscar
              </button>
            </form>
          </div>

          {docs.length === 0 ? (
            <EmptyState title="Nenhum documento encontrado" description={q ? "Tente outro termo de busca." : "Envie o primeiro documento pelo botão “Novo documento”."} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Título</Th>
                  <Th>Categoria</Th>
                  <Th>Família / paciente</Th>
                  <Th>Enviado por</Th>
                  <Th>Data</Th>
                  <Th>Tamanho</Th>
                  <Th>Status</Th>
                  <Th>Família vê</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} data-testid="document-row">
                    <Td className="font-semibold text-t1">
                      <a href={`/files?path=${encodeURIComponent(d.file_path)}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                        {DOCUMENT_CATEGORY_ICONS[d.category]} {d.title}
                      </a>
                    </Td>
                    <Td>{DOCUMENT_CATEGORY_LABELS[d.category]}</Td>
                    <Td>
                      {d.family?.name ?? "—"}
                      {d.patient && <div className="text-[11px] text-t3">{d.patient.full_name}</div>}
                    </Td>
                    <Td>
                      {d.uploader?.full_name ?? "—"}
                      {d.uploader && <div className="text-[11px] text-t3">{ROLE_LABELS[d.uploader.role]}</div>}
                    </Td>
                    <Td>{formatDate(d.created_at)}</Td>
                    <Td>{formatBytes(d.size_bytes)}</Td>
                    <Td>
                      <Badge tone={d.status === "available" ? "green" : d.status === "under_review" ? "yellow" : "blue"}>{DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                    </Td>
                    <Td>{d.visible_to_family ? <Badge tone="blue">Sim</Badge> : <Badge>Não</Badge>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`/files?path=${encodeURIComponent(d.file_path)}&download=1`} className={buttonClass("ghost", "sm")}>
                          ↓ Baixar
                        </a>
                        {isManager && d.status === "under_review" && (
                          <ActionButton action={releaseDocument} fields={{ documentId: d.id }} label="✓ Liberar" variant="success" testId="document-release" />
                        )}
                        {d.uploaded_by === user.id && (
                          <ActionButton
                            action={deleteDocument}
                            fields={{ documentId: d.id }}
                            label="Excluir"
                            variant="danger"
                            confirmMessage={`Excluir “${d.title}”? O arquivo também será removido.`}
                            testId="document-delete"
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
