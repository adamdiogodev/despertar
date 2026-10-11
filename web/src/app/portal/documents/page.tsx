import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCEPT_ATTRIBUTE } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Card, CardTitle, EmptyState, PageHeader, buttonClass } from "@/components/ui/primitives";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { loadPortalChildren } from "@/components/portal/data";
import { SignDocumentButton, UploadDocumentForm } from "@/components/portal/document-forms";
import { signDocument, uploadFamilyDocument } from "./actions";

const REPORT_TYPES = {
  evaluation: "Relatório de avaliação",
  quarterly: "Relatório trimestral",
  semiannual: "Relatório semestral",
  school: "Relatório escolar",
  other: "Relatório",
} as const;

function fileHref(path: string, download = false) {
  return `/files?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function DocRow({ icon, title, meta, children }: { icon: string; title: string; meta: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-line-light px-5 py-3 first:border-t-0">
      <div className="text-2xl" aria-hidden>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-t1">{title}</div>
        <div className="text-xs text-t3">{meta}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

export default async function PortalDocumentsPage({ searchParams }: PageProps<"/portal/documents">) {
  const user = await requireRole(["guardian"]);
  const { child } = await searchParams;
  const { children, selectedId, patientIds, familyIds } = await loadPortalChildren(child);
  const supabase = await createClient();

  const [signaturesRes, clinicDocsRes, reportsRes, mineRes] = await Promise.all([
    supabase
      .from("signature_requests")
      .select("id, status, due_date, signed_at, created_at, documents(title, file_path, size_bytes)")
      .eq("signer_id", user.id)
      .neq("status", "canceled")
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, title, file_path, size_bytes, category, patient_id, created_at")
      .eq("visible_to_family", true)
      .in("family_id", familyIds)
      .or(`uploaded_by.is.null,uploaded_by.neq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reports")
      .select("id, report_type, reference_label, file_path, reviewed_at, submitted_at, patients(full_name), therapists(profiles(full_name))")
      .in("patient_id", patientIds)
      .eq("status", "approved")
      .not("file_path", "is", null)
      .order("reviewed_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, title, file_path, size_bytes, status, patient_id, created_at, patients(full_name)")
      .eq("uploaded_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const signatures = signaturesRes.data ?? [];
  const pending = signatures.filter((s) => s.status === "pending");
  const signed = signatures.filter((s) => s.status === "signed");
  // Family-wide documents (no child) always show; child documents follow the selector.
  const clinicDocs = (clinicDocsRes.data ?? []).filter((d) => !d.patient_id || patientIds.includes(d.patient_id));
  const reports = reportsRes.data ?? [];
  const mine = (mineRes.data ?? []).filter((d) => !selectedId || d.patient_id === selectedId);
  const nameOf = (patientId: string | null) => children.find((c) => c.id === patientId)?.fullName;

  return (
    <div>
      <PageHeader title="Documentos" description="Assine documentos, veja relatórios e envie laudos ou receitas para a clínica." />
      <ChildSwitcher items={children} selectedId={selectedId} basePath="/portal/documents" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-0" data-testid="to-sign">
            <div className="px-5 pt-5">
              <CardTitle>✍ Para assinar</CardTitle>
            </div>
            {pending.length === 0 ? (
              <EmptyState icon="🎉" title="Nada para assinar" description="Quando a clínica enviar um documento para sua assinatura, ele aparece aqui." />
            ) : (
              <ul className="pb-2">
                {pending.map((s) => (
                  <DocRow
                    key={s.id}
                    icon="📄"
                    title={s.documents?.title ?? "Documento"}
                    meta={[`Enviado em ${formatDate(s.created_at)}`, s.due_date && `assinar até ${formatDate(s.due_date)}`, formatSize(s.documents?.size_bytes ?? null)]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    <Badge tone="yellow">Aguarda assinatura</Badge>
                    {s.documents && (
                      <SignDocumentButton requestId={s.id} title={s.documents.title} fileHref={fileHref(s.documents.file_path)} action={signDocument} />
                    )}
                  </DocRow>
                ))}
              </ul>
            )}
            {signed.length > 0 && (
              <div className="border-t border-line px-5 py-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-t3">Já assinados</div>
                <ul className="space-y-1.5">
                  {signed.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                      {s.documents ? (
                        <a href={fileHref(s.documents.file_path)} target="_blank" rel="noopener noreferrer" className="truncate text-t1 hover:text-primary">
                          {s.documents.title}
                        </a>
                      ) : (
                        <span>Documento</span>
                      )}
                      <span className="shrink-0 text-xs text-ok">✓ {formatDateTime(s.signed_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="p-0">
            <div className="px-5 pt-5">
              <CardTitle>📑 Relatórios e documentos da clínica</CardTitle>
            </div>
            {reports.length + clinicDocs.length === 0 ? (
              <EmptyState icon="📂" title="Nenhum documento disponível ainda" />
            ) : (
              <ul className="pb-2">
                {reports.map((r) => (
                  <DocRow
                    key={`r-${r.id}`}
                    icon="📊"
                    title={`${REPORT_TYPES[r.report_type]} — ${r.reference_label}`}
                    meta={[r.patients?.full_name, r.therapists?.profiles?.full_name, formatDate(r.reviewed_at ?? r.submitted_at)].filter(Boolean).join(" · ")}
                  >
                    <a href={fileHref(r.file_path!)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}>
                      👁 Ver
                    </a>
                  </DocRow>
                ))}
                {clinicDocs.map((d) => (
                  <DocRow
                    key={d.id}
                    icon="📄"
                    title={d.title}
                    meta={[nameOf(d.patient_id) ?? "Família", formatDate(d.created_at), formatSize(d.size_bytes)].filter(Boolean).join(" · ")}
                  >
                    <a href={fileHref(d.file_path)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}>
                      👁 Ver
                    </a>
                    <a href={fileHref(d.file_path, true)} className={buttonClass("ghost", "sm")} aria-label={`Baixar ${d.title}`}>
                      ↓
                    </a>
                  </DocRow>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>📤 Enviar documento à clínica</CardTitle>
            {children.length === 0 ? (
              <EmptyState icon="🧒" title="Nenhuma criança vinculada" />
            ) : (
              <UploadDocumentForm
                childOptions={children.map((c) => ({ id: c.id, name: c.fullName }))}
                defaultChildId={selectedId}
                accept={ACCEPT_ATTRIBUTE}
                action={uploadFamilyDocument}
              />
            )}
          </Card>

          <Card className="p-0">
            <div className="px-5 pt-5">
              <CardTitle>Enviados por mim</CardTitle>
            </div>
            {mine.length === 0 ? (
              <EmptyState icon="📭" title="Você ainda não enviou documentos" />
            ) : (
              <ul className="pb-2" data-testid="my-documents">
                {mine.map((d) => (
                  <DocRow
                    key={d.id}
                    icon="📎"
                    title={d.title}
                    meta={[d.patients?.full_name, `Enviado em ${formatDate(d.created_at)}`, formatSize(d.size_bytes)].filter(Boolean).join(" · ")}
                  >
                    {d.status === "under_review" ? <Badge tone="blue">Em análise</Badge> : <Badge tone="green">Recebido</Badge>}
                    <a href={fileHref(d.file_path, true)} className={buttonClass("ghost", "sm")} aria-label={`Baixar ${d.title}`}>
                      ↓
                    </a>
                  </DocRow>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
