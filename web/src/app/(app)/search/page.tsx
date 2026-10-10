import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

const KIND_META: Record<string, { label: string; href: (id: string) => string }> = {
  patient: { label: "Paciente", href: (id) => `/patients/${id}` },
  family: { label: "Família", href: (id) => `/families/${id}` },
  document: { label: "Documento", href: () => `/documents` },
  report: { label: "Relatório", href: () => `/reports` },
  person: { label: "Pessoa", href: () => `/messages` },
};

// Global search runs as SECURITY INVOKER in the database, so each user only
// finds what RLS already lets them see.
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const { q } = await searchParams;
  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";

  let results: { kind: string; id: string; title: string; subtitle: string }[] = [];
  if (term.length >= 2) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("global_search", { term });
    results = data ?? [];
  }

  return (
    <>
      <PageHeader title="Busca" description={term ? `Resultados para “${term}”` : "Digite ao menos 2 caracteres na barra de busca."} />
      <Card className="p-0">
        {term.length >= 2 && results.length === 0 && <EmptyState icon="🔍" title="Nada encontrado" description="Tente outro termo." />}
        {results.map((result) => {
          const meta = KIND_META[result.kind];
          return (
            <Link
              key={`${result.kind}-${result.id}`}
              href={meta?.href(result.id) ?? "#"}
              className="flex items-center justify-between gap-4 border-b border-line-light px-5 py-3.5 last:border-0 hover:bg-line-light"
            >
              <div>
                <div className="text-sm font-semibold text-t1">{result.title}</div>
                {result.subtitle && <div className="text-xs text-t3">{result.subtitle}</div>}
              </div>
              <Badge tone="blue">{meta?.label ?? result.kind}</Badge>
            </Link>
          );
        })}
      </Card>
    </>
  );
}
