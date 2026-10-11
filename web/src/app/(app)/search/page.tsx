import Link from "next/link";
import { ROLE_LABELS, requireUser, type AppRole, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

type Result = { kind: string; id: string; title: string; subtitle: string };

const KIND_META: Record<string, { label: string; tone: "blue" | "green" | "purple" | "yellow" | "gray" }> = {
  patient: { label: "Paciente", tone: "blue" },
  family: { label: "Família", tone: "green" },
  guardian: { label: "Responsável", tone: "green" },
  therapist: { label: "Terapeuta", tone: "purple" },
  staff: { label: "Equipe", tone: "gray" },
  document: { label: "Documento", tone: "yellow" },
  report: { label: "Relatório", tone: "yellow" },
};

const GROUP_LABELS: Record<string, string> = {
  patient: "Pacientes",
  family: "Famílias",
  guardian: "Responsáveis",
  therapist: "Terapeutas",
  staff: "Equipe",
  document: "Documentos",
  report: "Relatórios",
};

const DOCUMENT_CATEGORIES: Record<string, string> = {
  contract: "Contrato",
  anamnesis: "Anamnese",
  report: "Relatório",
  medical: "Laudo / médico",
  treatment_plan: "Plano de atendimento",
  administrative: "Administrativo",
  other: "Outro",
};

const REPORT_STATUS: Record<string, string> = {
  pending: "Pendente",
  in_review: "Em revisão",
  approved: "Aprovado",
  returned: "Devolvido",
};

// Where each result takes the user. Guardians resolve to their family page
// (the database already returns the family id for them).
function hrefFor(result: Result, user: CurrentUser): string {
  switch (result.kind) {
    case "patient":
      return `/patients/${result.id}`;
    case "family":
    case "guardian":
      return `/families/${result.id}`;
    case "therapist":
      return `/therapists/${result.id}`;
    case "staff":
      return user.role === "admin" ? "/settings?tab=users" : "/messages";
    case "document":
      return `/documents?q=${encodeURIComponent(result.title)}`;
    case "report":
      return `/reports?tab=${result.subtitle}&q=${encodeURIComponent(result.title.split(" — ")[0])}`;
    default:
      return "#";
  }
}

function subtitleFor(result: Result): string {
  if (result.kind === "guardian") return "Responsável — abrir família";
  if (result.kind === "therapist" || result.kind === "staff") return ROLE_LABELS[result.subtitle as AppRole] ?? result.subtitle;
  if (result.kind === "document") return DOCUMENT_CATEGORIES[result.subtitle] ?? result.subtitle;
  if (result.kind === "report") return REPORT_STATUS[result.subtitle] ?? result.subtitle;
  if (result.kind === "patient") return result.subtitle;
  return result.subtitle;
}

// Global search runs as SECURITY INVOKER in the database, so each user only
// finds what RLS already lets them see. Every word must match (no accents/case).
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requireUser();
  const { q } = await searchParams;
  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";

  let results: Result[] = [];
  if (term.length >= 2) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("global_search", { term });
    results = data ?? [];
  }

  const groups = Object.keys(KIND_META)
    .map((kind) => ({ kind, items: results.filter((result) => result.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        title="Busca"
        description={term ? `${results.length} resultado(s) para “${term}”` : "Digite ao menos 2 caracteres na barra de busca."}
      />
      {term.length >= 2 && results.length === 0 && (
        <Card>
          <EmptyState icon="🔍" title="Nada encontrado" description="Tente outro termo — vale nome do paciente, da família, do responsável ou do terapeuta." />
        </Card>
      )}
      <div className="space-y-5">
        {groups.map((group) => (
          <Card key={group.kind} className="p-0">
            <div className="border-b border-line px-5 py-3 text-xs font-bold uppercase tracking-wide text-t3">
              {GROUP_LABELS[group.kind]}
            </div>
            {group.items.map((result) => (
              <Link
                key={`${result.kind}-${result.id}-${result.title}`}
                href={hrefFor(result, user)}
                className="flex items-center justify-between gap-4 border-b border-line-light px-5 py-3.5 last:border-0 hover:bg-line-light"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-t1">{result.title}</div>
                  <div className="truncate text-xs text-t3">{subtitleFor(result)}</div>
                </div>
                <Badge tone={KIND_META[result.kind]?.tone ?? "gray"}>{KIND_META[result.kind]?.label ?? result.kind}</Badge>
              </Link>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}
