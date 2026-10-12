import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Database } from "@/lib/database.types";
import { Badge, Card, CardTitle, EmptyState, LinkButton, Table, Td, Th } from "@/components/ui/primitives";
import { ACCEPT_ATTRIBUTE } from "@/lib/files";
import { CreateReportModal, SubmitReportModal, UploadReportModal, type PatientOption } from "@/components/reports/report-forms";
import { UploadDocumentModal } from "@/components/documents/upload-document-modal";
import { createReport, submitReport, uploadReport } from "@/app/(app)/reports/actions";
import { uploadDocument } from "@/app/(app)/documents/actions";
import { fileHref } from "./session-record-utils";
import { DOCUMENT_CATEGORY_LABELS } from "@/components/documents/document-utils";

type Enums = Database["public"]["Enums"];

const REPORT_TYPE: Record<Enums["report_type"], string> = {
  evaluation: "Avaliação",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  school: "Escolar",
  other: "Outro",
};

const REPORT_STATUS: Record<Enums["report_status"], { label: string; tone: "yellow" | "blue" | "green" | "red" }> = {
  pending: { label: "Pendente", tone: "yellow" },
  in_review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovado", tone: "green" },
  returned: { label: "Devolvido", tone: "red" },
};

export async function ReportsTab({
  patient,
  canRequest,
  canUpload,
  isTherapist,
  userId,
}: {
  patient: PatientOption;
  canRequest: boolean;
  canUpload: boolean;
  isTherapist: boolean;
  userId: string;
}) {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_type, reference_label, due_date, status, file_path, therapist_id, therapist:therapists (profile:profiles (full_name))")
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false });

  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle
          action={
            <div className="flex flex-wrap gap-2">
              {canRequest && <CreateReportModal action={createReport} patients={[patient]} chooseTherapist defaultPatientId={patient.id} />}
              {canUpload && <UploadReportModal action={uploadReport} patient={patient} chooseTherapist={!isTherapist} accept={ACCEPT_ATTRIBUTE} />}
              <LinkButton href="/reports" variant="ghost" size="sm">
                Ver todos →
              </LinkButton>
            </div>
          }
        >
          Relatórios
        </CardTitle>
      </div>
      {!reports?.length ? (
        <EmptyState icon="📊" title="Nenhum relatório" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th>Referência</Th>
              <Th>Terapeuta</Th>
              <Th>Prazo</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const canSubmit = isTherapist && report.therapist_id === userId && (report.status === "pending" || report.status === "returned");
              const status = REPORT_STATUS[report.status];
              return (
                <tr key={report.id} data-testid="report-row">
                  <Td className="font-semibold text-t1">{REPORT_TYPE[report.report_type]}</Td>
                  <Td>
                    <Link href="/reports" className="text-primary hover:underline">
                      {report.reference_label}
                    </Link>
                  </Td>
                  <Td>{report.therapist?.profile?.full_name ?? "—"}</Td>
                  <Td>{formatDate(report.due_date)}</Td>
                  <Td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </Td>
                  <Td className="text-right">
                    {canSubmit ? (
                      <SubmitReportModal action={submitReport} reportId={report.id} patientName={patient.name} accept={ACCEPT_ATTRIBUTE} />
                    ) : report.file_path ? (
                      <a href={fileHref(report.file_path)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">
                        Abrir arquivo
                      </a>
                    ) : null}
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

export async function DocumentsTab({ patient, canUpload }: { patient: { id: string; name: string }; canUpload: boolean }) {
  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, category, file_path, visible_to_family, created_at")
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false });

  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle
          action={
            canUpload && (
              <UploadDocumentModal
                action={uploadDocument}
                families={[]}
                patients={[patient]}
                allowInternal={false}
                accept={ACCEPT_ATTRIBUTE}
                defaultTarget={`patient:${patient.id}`}
              />
            )
          }
        >
          Documentos
        </CardTitle>
      </div>
      {!documents?.length ? (
        <EmptyState icon="📁" title="Nenhum documento" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Título</Th>
              <Th>Categoria</Th>
              <Th>Família</Th>
              <Th>Data</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
              const href = `/files?path=${encodeURIComponent(document.file_path)}`;
              return (
                <tr key={document.id} data-testid="document-row">
                  <Td className="font-semibold text-t1">
                    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      📄 {document.title}
                    </a>
                  </Td>
                  <Td>
                    <Badge tone="blue">{DOCUMENT_CATEGORY_LABELS[document.category]}</Badge>
                  </Td>
                  <Td>{document.visible_to_family ? <Badge tone="green">Visível</Badge> : <Badge tone="gray">Interno</Badge>}</Td>
                  <Td>{formatDate(document.created_at)}</Td>
                  <Td className="text-right">
                    <a href={`${href}&download=1`} className="text-xs font-semibold text-primary hover:underline">
                      Baixar
                    </a>
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
