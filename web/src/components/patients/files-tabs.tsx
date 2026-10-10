import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Database } from "@/lib/database.types";
import { Badge, Card, CardTitle, EmptyState, LinkButton, Table, Td, Th } from "@/components/ui/primitives";

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

const DOCUMENT_CATEGORY: Record<Enums["document_category"], string> = {
  contract: "Contrato",
  anamnesis: "Anamnese",
  report: "Relatório",
  medical: "Médico",
  treatment_plan: "Plano de atendimento",
  administrative: "Administrativo",
  other: "Outro",
};

export async function ReportsTab({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_type, reference_label, due_date, status, therapist:therapists (profile:profiles (full_name))")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle action={<LinkButton href="/reports" variant="ghost" size="sm">Ver todos os relatórios →</LinkButton>}>Relatórios</CardTitle>
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
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
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
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

export async function DocumentsTab({ patientId }: { patientId: string }) {
  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, category, file_path, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <CardTitle>Documentos</CardTitle>
      </div>
      {!documents?.length ? (
        <EmptyState icon="📁" title="Nenhum documento" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Título</Th>
              <Th>Categoria</Th>
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
                    <Badge tone="blue">{DOCUMENT_CATEGORY[document.category]}</Badge>
                  </Td>
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
