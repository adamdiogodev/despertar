import Link from "next/link";
import { z } from "zod";
import { ROLE_LABELS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, zonedToIso } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, buttonClass } from "@/components/ui/primitives";

export const metadata = { title: "Auditoria — Sistema Despertar" };

const PAGE_SIZE = 50;

// Tables with the audit trigger, plus explicit clinical-record views.
const ENTITY_LABELS: Record<string, string> = {
  clinical_record: "Prontuário (acesso)",
  profiles: "Usuários",
  families: "Famílias",
  guardians: "Responsáveis",
  patients: "Pacientes",
  care_assignments: "Vínculos terapêuticos",
  session_notes: "Evoluções",
  treatment_plans: "Planos terapêuticos",
  reports: "Relatórios",
  documents: "Documentos",
  signature_requests: "Assinaturas",
  therapist_rates: "Valores de repasse",
  invoice_requests: "Notas fiscais",
  charges: "Cobranças",
};

const ACTION_INFO: Record<string, { label: string; tone: "green" | "blue" | "red" | "purple" | "gray" }> = {
  insert: { label: "Criou", tone: "green" },
  update: { label: "Alterou", tone: "blue" },
  delete: { label: "Excluiu", tone: "red" },
  view: { label: "Visualizou", tone: "purple" },
};

const filtersSchema = z.object({
  entity: z.enum(Object.keys(ENTITY_LABELS) as [string, ...string[]]).optional().catch(undefined),
  actor: z.guid().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireRole(["admin"]);
  const raw = await searchParams;
  const filters = filtersSchema.parse({
    entity: raw.entity || undefined,
    actor: raw.actor || undefined,
    from: raw.from || undefined,
    to: raw.to || undefined,
    page: raw.page ?? 1,
  });

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, changed_columns, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE - 1);
  if (filters.entity) query = query.eq("entity", filters.entity);
  if (filters.actor) query = query.eq("actor_id", filters.actor);
  if (filters.from) query = query.gte("created_at", zonedToIso(filters.from, "00:00"));
  if (filters.to) query = query.lt("created_at", new Date(new Date(zonedToIso(filters.to, "00:00")).getTime() + 86_400_000).toISOString());

  const [{ data: entries, count }, { data: people }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
  ]);
  const names = new Map((people ?? []).map((person) => [person.id, person]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const key of ["entity", "actor", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]!);
    params.set("page", String(page));
    return `/audit?${params}`;
  };

  const fieldClass = "rounded-lg border-[1.5px] border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <>
      <PageHeader title="Auditoria" description="Quem criou, alterou, excluiu ou visualizou registros sensíveis (LGPD). O conteúdo clínico não é copiado para cá." />

      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3" data-testid="audit-filters">
          <label className="text-xs font-semibold text-t2">
            Entidade
            <select name="entity" defaultValue={filters.entity ?? ""} className={`${fieldClass} mt-1 block`}>
              <option value="">Todas</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-t2">
            Usuário
            <select name="actor" defaultValue={filters.actor ?? ""} className={`${fieldClass} mt-1 block max-w-64`}>
              <option value="">Todos</option>
              {(people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} ({ROLE_LABELS[person.role]})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-t2">
            De
            <input type="date" name="from" defaultValue={filters.from ?? ""} className={`${fieldClass} mt-1 block`} />
          </label>
          <label className="text-xs font-semibold text-t2">
            Até
            <input type="date" name="to" defaultValue={filters.to ?? ""} className={`${fieldClass} mt-1 block`} />
          </label>
          <button className={buttonClass("primary", "md")}>Filtrar</button>
          <Link href="/audit" className={buttonClass("ghost", "md")}>
            Limpar
          </Link>
        </form>
      </Card>

      <Card className="p-0">
        {!entries?.length ? (
          <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros para ver outros eventos." icon="🔎" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Usuário</Th>
                <Th>Ação</Th>
                <Th>Entidade</Th>
                <Th>Colunas alteradas</Th>
              </tr>
            </thead>
            <tbody data-testid="audit-table">
              {entries.map((entry) => {
                const actor = entry.actor_id ? names.get(entry.actor_id) : null;
                const action = ACTION_INFO[entry.action] ?? { label: entry.action, tone: "gray" as const };
                return (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(entry.created_at)}</Td>
                    <Td>
                      {actor ? (
                        <>
                          <div className="font-semibold text-t1">{actor.full_name}</div>
                          <div className="text-[11px] text-t3">{ROLE_LABELS[actor.role]}</div>
                        </>
                      ) : (
                        <span className="text-t3">{entry.actor_id ? "Usuário removido" : "Sistema"}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={action.tone}>{action.label}</Badge>
                    </Td>
                    <Td>
                      <div className="text-t1">{ENTITY_LABELS[entry.entity] ?? entry.entity}</div>
                      {entry.entity_id && <div className="font-mono text-[10px] text-t3">{entry.entity_id}</div>}
                    </Td>
                    <Td className="max-w-xs text-xs">{entry.changed_columns?.length ? entry.changed_columns.join(", ") : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-t2">
          <span>
            {count ?? 0} registro(s) · página {Math.min(filters.page, totalPages)} de {totalPages}
          </span>
          <div className="flex gap-2">
            {filters.page > 1 && (
              <Link href={pageHref(filters.page - 1)} className={buttonClass("ghost", "sm")}>
                ← Anterior
              </Link>
            )}
            {filters.page < totalPages && (
              <Link href={pageHref(filters.page + 1)} className={buttonClass("ghost", "sm")}>
                Próxima →
              </Link>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
