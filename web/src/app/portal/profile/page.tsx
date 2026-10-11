import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, formatDate, formatRelative } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, EmptyState, InfoRow, PageHeader } from "@/components/ui/primitives";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { loadPortalChildren } from "@/components/portal/data";
import { DataUpdateForm, PasswordForm, PhoneForm } from "@/components/portal/profile-forms";
import { changeMyPassword, requestDataUpdate, updateMyPhone } from "./actions";

const REQUEST_STATUS = {
  open: { label: "Aguardando", tone: "yellow" },
  answered: { label: "Respondida", tone: "green" },
  closed: { label: "Concluída", tone: "gray" },
} as const;

export default async function PortalProfilePage({ searchParams }: PageProps<"/portal/profile">) {
  const user = await requireRole(["guardian"]);
  const { child } = await searchParams;
  const { children, selected, selectedId, patientIds } = await loadPortalChildren(child);
  const supabase = await createClient();

  const [profileRes, guardiansRes, requestsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone").eq("id", user.id).single(),
    supabase
      .from("guardians")
      .select("relationship, families(id, name, address, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)")
      .eq("profile_id", user.id),
    supabase
      .from("guardian_requests")
      .select("id, message, status, response, created_at")
      .eq("requested_by", user.id)
      .eq("request_type", "data_update")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const profile = profileRes.data;
  const families = (guardiansRes.data ?? [])
    .flatMap((g) => (g.families ? [{ ...g.families, relationship: g.relationship }] : []))
    .filter((family) => !selected || family.id === selected.familyId);
  const visibleChildren = children.filter((c) => patientIds.includes(c.id));
  const requests = requestsRes.data ?? [];

  return (
    <div>
      <PageHeader title="Meu perfil" description="Seus dados, das crianças e da equipe que cuida delas." />
      <ChildSwitcher items={children} selectedId={selectedId} basePath="/portal/profile" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {visibleChildren.length === 0 && (
            <Card>
              <EmptyState icon="🧒" title="Nenhuma criança vinculada" description="Fale com a recepção da clínica para concluir o cadastro." />
            </Card>
          )}
          {visibleChildren.map((c) => {
            const age = ageFrom(c.birthDate);
            return (
              <Card key={c.id} data-testid="profile-child">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={c.fullName} size={44} />
                  <div>
                    <h2 className="font-bold text-t1">{c.fullName}</h2>
                    <div className="text-xs text-t3">{c.familyName}</div>
                  </div>
                </div>
                <InfoRow label="Nascimento">
                  {formatDate(c.birthDate)}
                  {age != null && ` · ${age} ${age === 1 ? "ano" : "anos"}`}
                </InfoRow>
                <InfoRow label="Convênio">
                  {c.insuranceName}
                  {c.insuranceNumber && ` · Nº ${c.insuranceNumber}`}
                </InfoRow>
                <InfoRow label="Escola">{c.school ?? "—"}</InfoRow>
                <InfoRow label="Início do atendimento">{formatDate(c.careStartedOn)}</InfoRow>

                <div className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-t3">Terapeutas</div>
                {c.assignments.length === 0 ? (
                  <p className="text-sm text-t3">Nenhuma terapia ativa no momento.</p>
                ) : (
                  <ul className="space-y-2">
                    {c.assignments.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg border border-line-light p-3">
                        <Avatar name={a.therapistName} size={34} />
                        <div className="min-w-0 flex-1 text-sm">
                          <div className="font-semibold text-t1">{a.therapistName}</div>
                          <div className="text-xs text-t2">
                            {a.specialty}
                            {a.councilRegistry && ` · ${a.councilRegistry}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge tone="blue">{a.therapy}</Badge>
                          {a.frequency && <div className="mt-1 text-[11px] text-t3">{a.frequency}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          {families.map((family) => (
            <Card key={family.id}>
              <CardTitle>🏠 {family.name}</CardTitle>
              <InfoRow label="Endereço">{family.address ?? "—"}</InfoRow>
              <InfoRow label="Meu vínculo">{family.relationship}</InfoRow>
              <div className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-t3">Contato de emergência</div>
              {family.emergency_contact_name ? (
                <>
                  <InfoRow label="Nome">{family.emergency_contact_name}</InfoRow>
                  <InfoRow label="Telefone">{family.emergency_contact_phone ?? "—"}</InfoRow>
                  <InfoRow label="Parentesco">{family.emergency_contact_relationship ?? "—"}</InfoRow>
                </>
              ) : (
                <p className="text-sm text-t3">Não informado. Peça a atualização abaixo.</p>
              )}
            </Card>
          ))}

          <Card>
            <CardTitle>👤 Minha conta</CardTitle>
            <InfoRow label="Nome">{profile?.full_name}</InfoRow>
            <InfoRow label="E-mail">{profile?.email}</InfoRow>
            <div className="mt-4">
              <PhoneForm phone={profile?.phone ?? null} action={updateMyPhone} />
            </div>
          </Card>

          <Card>
            <CardTitle>✏ Solicitar atualização de dados</CardTitle>
            <p className="mb-4 text-sm text-t2">Mudou de endereço, convênio ou escola? Conte para a gente que a recepção atualiza o cadastro.</p>
            {families.length === 0 ? (
              <EmptyState icon="🏠" title="Nenhuma família vinculada" />
            ) : (
              <DataUpdateForm
                families={families.map((f) => ({ id: f.id, name: f.name }))}
                childOptions={visibleChildren.map((c) => ({ id: c.id, name: c.fullName }))}
                action={requestDataUpdate}
              />
            )}
            {requests.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {requests.map((r) => (
                  <li key={r.id} className="text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 text-t2">{r.message}</p>
                      <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                    </div>
                    {r.response && <p className="mt-1 text-xs text-t1">Resposta: {r.response}</p>}
                    <div className="text-[11px] text-t3">{formatRelative(r.created_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>🔒 Trocar senha</CardTitle>
            <PasswordForm action={changeMyPassword} />
          </Card>
        </div>
      </div>
    </div>
  );
}
