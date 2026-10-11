import { STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { Card, LinkButton, PageHeader } from "@/components/ui/primitives";
import { FamilyList, parseFamilyFilters } from "@/components/admin/family-list";
import { NewFamilyButton } from "./family-forms";

export const metadata = { title: "Famílias — Sistema Despertar" };

export default async function FamiliesPage({ searchParams }: PageProps<"/families">) {
  const user = await requireRole(TEAM_ROLES);
  const { q, status } = parseFamilyFilters(await searchParams);
  const isStaff = STAFF_ROLES.includes(user.role);

  return (
    <>
      <PageHeader
        title="Famílias"
        description={isStaff ? "Relacionamento, responsáveis e contato com as famílias atendidas" : "Famílias dos pacientes vinculados a você"}
        actions={
          isStaff && (
            <>
              <LinkButton href="/families/requests" variant="ghost">
                Solicitações
              </LinkButton>
              <NewFamilyButton />
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,380px)_1fr] [&>*]:min-w-0">
        <FamilyList q={q} status={status} />
        <Card className="hidden h-fit py-14 text-center lg:block">
          <div className="mb-3 text-5xl opacity-30">👨‍👩‍👦</div>
          <div className="text-sm font-semibold text-t2">Selecione uma família</div>
          <div className="mt-1 text-xs text-t3">Clique em uma família para ver os detalhes</div>
        </Card>
      </div>
    </>
  );
}
