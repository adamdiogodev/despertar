import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, EmptyState, cn, buttonClass } from "@/components/ui/primitives";
import { RECORD_STATUS, escapeLike } from "./labels";

const STATUSES = ["active", "pending", "inactive"] as const;
type Status = (typeof STATUSES)[number];

export function parseFamilyFilters(params: { q?: string | string[]; status?: string | string[] }) {
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const status: Status | "" = STATUSES.includes(params.status as Status) ? (params.status as Status) : "";
  return { q, status };
}

// Left column of the families panel. RLS limits therapists to linked families.
export async function FamilyList({ q, status, selectedId }: { q: string; status: Status | ""; selectedId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("families")
    .select("id, name, status, patients(full_name), guardians(is_primary, profiles(full_name))")
    .order("name");
  if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
  if (status) query = query.eq("status", status);
  const { data: families } = await query;

  const keep = new URLSearchParams({ ...(q && { q }), ...(status && { status }) }).toString();

  return (
    <div>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar família..."
          aria-label="Buscar família"
          className="min-w-[10rem] flex-1 basis-full rounded-lg border-[1.5px] sm:basis-auto border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          data-testid="family-search"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="rounded-lg border-[1.5px] border-line bg-white px-2 py-2 text-sm outline-none focus:border-primary"
          data-testid="family-status-filter"
        >
          <option value="">Todas</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {RECORD_STATUS[value].label}
            </option>
          ))}
        </select>
        <button className={buttonClass("ghost", "md")}>Filtrar</button>
      </form>

      {!families?.length ? (
        <Card>
          <EmptyState title="Nenhuma família encontrada" description="Ajuste a busca ou o filtro de status." icon="👨‍👩‍👦" />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5" data-testid="family-list">
          {families.map((family) => {
            const primary = family.guardians.find((guardian) => guardian.is_primary) ?? family.guardians[0];
            const children = family.patients.map((patient) => patient.full_name).join(", ");
            return (
              <li key={family.id}>
                <Link
                  href={`/families/${family.id}${keep ? `?${keep}` : ""}`}
                  className={cn(
                    "flex items-center gap-3 rounded-card border-[1.5px] bg-white p-4 shadow-card transition-colors hover:border-primary",
                    family.id === selectedId ? "border-primary" : "border-line",
                  )}
                >
                  <Avatar name={family.name.replace(/^Família\s+/i, "")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-t1">{family.name}</div>
                    <div className="truncate text-xs text-t3">
                      {children || "Sem crianças cadastradas"}
                      {primary?.profiles ? ` · Resp: ${primary.profiles.full_name}` : ""}
                    </div>
                  </div>
                  <Badge tone={RECORD_STATUS[family.status].tone}>{RECORD_STATUS[family.status].label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
