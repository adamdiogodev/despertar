import { ROLE_LABELS, requireRole, type AppRole } from "@/lib/auth";
import { listAuthInfo, SWITCHABLE_ROLES } from "@/lib/accounts";
import { NAV_GROUPS, PORTAL_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Table, Tabs, Td, Th, cn } from "@/components/ui/primitives";
import { ROLE_TONES } from "@/components/admin/labels";
import { CatalogToggle, ClinicForm, NewCatalogItemForm, NewStaffUserButton, UserRowActions } from "./settings-forms";

export const metadata = { title: "Configurações — Sistema Despertar" };

const TABS = ["clinic", "users", "catalog", "permissions"] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireRole(["admin"]);
  const { tab: rawTab, role } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "clinic";

  return (
    <>
      <PageHeader title="Configurações" description="Dados da clínica, usuários, catálogos e permissões" />
      <Tabs
        active={tab}
        tabs={[
          { key: "clinic", label: "🏢 Clínica", href: "/settings?tab=clinic" },
          { key: "users", label: "👥 Usuários", href: "/settings?tab=users" },
          { key: "catalog", label: "🗂️ Terapias e salas", href: "/settings?tab=catalog" },
          { key: "permissions", label: "🔐 Permissões", href: "/settings?tab=permissions" },
        ]}
      />
      {tab === "clinic" && <ClinicTab />}
      {tab === "users" && <UsersTab roleFilter={typeof role === "string" ? role : ""} />}
      {tab === "catalog" && <CatalogTab />}
      {tab === "permissions" && <PermissionsTab />}
    </>
  );
}

async function ClinicTab() {
  const supabase = await createClient();
  const { data: clinic } = await supabase
    .from("clinic_settings")
    .select("name, tax_id, phone, whatsapp, address, email, reschedule_min_hours, updated_at")
    .eq("id", 1)
    .single();
  if (!clinic) return null;
  return (
    <Card className="max-w-2xl">
      <CardTitle>Dados da clínica</CardTitle>
      <ClinicForm clinic={clinic} />
      <p className="mt-3 text-[11px] text-t3">Última atualização: {formatDateTime(clinic.updated_at)}</p>
    </Card>
  );
}

const ROLE_FILTERS: (AppRole | "")[] = ["", "admin", "coordination", "reception", "therapist", "guardian"];

async function UsersTab({ roleFilter }: { roleFilter: string }) {
  const user = await requireRole(["admin"]);
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, email, role, active, last_seen_at").order("full_name");
  const activeFilter = ROLE_FILTERS.includes(roleFilter as AppRole) ? (roleFilter as AppRole | "") : "";
  if (activeFilter) query = query.eq("role", activeFilter);
  const [{ data: profiles }, authInfo] = await Promise.all([query, listAuthInfo()]);

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <h2 className="text-sm font-bold text-t1">Usuários do sistema</h2>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value="users" />
            <select
              name="role"
              defaultValue={activeFilter}
              aria-label="Filtrar por perfil"
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
            >
              {ROLE_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value ? ROLE_LABELS[value] : "Todos os perfis"}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-t2 hover:bg-line-light">Filtrar</button>
          </form>
          <NewStaffUserButton />
        </div>
      </div>
      {!profiles?.length ? (
        <EmptyState title="Nenhum usuário" icon="👥" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>E-mail</Th>
              <Th>Perfil</Th>
              <Th>Último acesso</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody data-testid="users-table">
            {profiles.map((profile) => {
              const info = authInfo.get(profile.id);
              const lastAccess = info?.lastSignInAt ?? profile.last_seen_at;
              return (
                <tr key={profile.id}>
                  <Td className="font-semibold text-t1">{profile.full_name}</Td>
                  <Td>{profile.email}</Td>
                  <Td>
                    <Badge tone={ROLE_TONES[profile.role]}>{ROLE_LABELS[profile.role]}</Badge>
                  </Td>
                  <Td>{lastAccess ? formatDateTime(lastAccess) : "Nunca acessou"}</Td>
                  <Td>
                    {!profile.active ? (
                      <Badge tone="gray">Inativo</Badge>
                    ) : info && !info.confirmed ? (
                      <Badge tone="yellow">Convite pendente</Badge>
                    ) : (
                      <Badge tone="green">Ativo</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <UserRowActions
                      id={profile.id}
                      role={profile.role}
                      active={profile.active}
                      canSwitchRole={SWITCHABLE_ROLES.includes(profile.role)}
                      isSelf={profile.id === user.id}
                    />
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

async function CatalogTab() {
  const supabase = await createClient();
  const [{ data: therapies }, { data: rooms }] = await Promise.all([
    supabase.from("therapies").select("id, name, active").order("name"),
    supabase.from("rooms").select("id, name, active").order("name"),
  ]);
  const sections = [
    { kind: "therapies" as const, title: "Terapias", items: therapies ?? [], placeholder: "Nova terapia" },
    { kind: "rooms" as const, title: "Salas", items: rooms ?? [], placeholder: "Nova sala" },
  ];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.kind}>
          <CardTitle>{section.title}</CardTitle>
          <ul className="divide-y divide-line-light">
            {section.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className={cn("flex-1 text-sm font-semibold", item.active ? "text-t1" : "text-t3 line-through")}>{item.name}</span>
                {!item.active && <Badge tone="gray">Inativa</Badge>}
                <CatalogToggle kind={section.kind} id={item.id} active={item.active} />
              </li>
            ))}
          </ul>
          <NewCatalogItemForm kind={section.kind} placeholder={section.placeholder} />
          <p className="mt-2 text-[11px] text-t3">Itens desativados deixam de aparecer para novos agendamentos, mas o histórico é mantido.</p>
        </Card>
      ))}
    </div>
  );
}

const MATRIX_ROLES: AppRole[] = ["admin", "coordination", "reception", "therapist"];

const RECORD_RULES: { title: string; rules: string[] }[] = [
  {
    title: "Vínculo terapêutico",
    rules: [
      "O vínculo (paciente × terapeuta × terapia, vigente) é o que libera o acesso do terapeuta.",
      "Terapeutas só veem pacientes, famílias, agenda e documentos dos pacientes vinculados.",
      "Responsáveis só veem os próprios filhos, pelo Portal da Família.",
    ],
  },
  {
    title: "Prontuário (evoluções e plano terapêutico)",
    rules: [
      "Acesso somente para os terapeutas vinculados ao paciente e para a coordenação.",
      "Administrador e recepção não acessam o conteúdo clínico.",
      "Responsáveis veem apenas as orientações para casa do plano terapêutico.",
      "Toda abertura de prontuário fica registrada na auditoria.",
    ],
  },
  {
    title: "Mensagens",
    rules: [
      "Equipe (administração, coordenação e recepção) conversa com todos.",
      "Terapeutas conversam entre si.",
      "Terapeuta e responsáveis só enquanto houver vínculo ativo com a criança.",
      "Responsáveis nunca conversam com outros responsáveis.",
    ],
  },
  {
    title: "Contas e financeiro",
    rules: [
      "Só o administrador cria contas de equipe e terapeutas, troca perfis e cadastra valores de repasse.",
      "Coordenação e recepção criam contas de responsáveis ao cadastrar famílias.",
      "Terapeutas veem apenas os próprios valores de repasse e notas fiscais.",
    ],
  },
];

function PermissionsTab() {
  const items = NAV_GROUPS.flatMap((group) => group.items);
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-0">
        <div className="p-5 pb-0">
          <CardTitle>Mapa de acesso por perfil</CardTitle>
          <p className="mb-4 text-xs text-t3">Reflete o menu de cada perfil. O banco de dados aplica as mesmas regras de forma independente.</p>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Módulo</Th>
              {MATRIX_ROLES.map((role) => (
                <Th key={role} className="text-center">
                  {ROLE_LABELS[role]}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody data-testid="permissions-matrix">
            {items.map((item) => (
              <tr key={item.href}>
                <Td className="font-semibold text-t1">{item.label}</Td>
                {MATRIX_ROLES.map((role) => (
                  <Td key={role} className="text-center">
                    {item.roles.includes(role) ? (
                      <span className="font-bold text-ok" aria-label="Permitido">
                        ✓
                      </span>
                    ) : (
                      <span className="text-t3" aria-label="Sem acesso">
                        —
                      </span>
                    )}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="border-t border-line p-5 text-xs text-t2">
          <b className="text-t1">{ROLE_LABELS.guardian}:</b> acessa somente o Portal da Família —{" "}
          {PORTAL_NAV.map((item) => item.label).join(", ")}.
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        {RECORD_RULES.map((section) => (
          <Card key={section.title}>
            <CardTitle>{section.title}</CardTitle>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-t2">
              {section.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
