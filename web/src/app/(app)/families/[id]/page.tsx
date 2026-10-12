import Link from "next/link";
import { notFound } from "next/navigation";
import { STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, formatDateTime } from "@/lib/format";
import { Alert, Avatar, Badge, Card, CardTitle, EmptyState, InfoRow, LinkButton, PageHeader } from "@/components/ui/primitives";
import { FamilyList, parseFamilyFilters } from "@/components/admin/family-list";
import { RECORD_STATUS } from "@/components/admin/labels";
import { AddGuardianButton, FamilyEditForm, GuardianActions, InternalNotesForm, NewFamilyButton } from "../family-forms";

export const metadata = { title: "Família — Sistema Despertar" };

const PATIENT_STATUS = { active: "Ativo", pending: "Pendente", inactive: "Inativo" } as const;

export default async function FamilyDetailPage({ params, searchParams }: PageProps<"/families/[id]">) {
  const user = await requireRole(TEAM_ROLES);
  const { id } = await params;
  const search = await searchParams;
  const { q, status } = parseFamilyFilters(search);
  const isStaff = STAFF_ROLES.includes(user.role);

  const supabase = await createClient();
  const [{ data: family }, { data: notes }] = await Promise.all([
    supabase
      .from("families")
      .select(
        "id, name, address, status, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, guardians(relationship, is_primary, profiles(id, full_name, email, phone, active)), patients(id, full_name, birth_date, status)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("family_internal_notes").select("notes, updated_at, profiles(full_name)").eq("family_id", id).maybeSingle(),
  ]);
  if (!family) notFound();

  const guardians = [...family.guardians].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const statusInfo = RECORD_STATUS[family.status];

  return (
    <>
      <PageHeader
        title="Famílias"
        description="Relacionamento, responsáveis e contato com as famílias atendidas"
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
        <div className="hidden lg:block">
          <FamilyList q={q} status={status} selectedId={family.id} />
        </div>

        <div className="flex flex-col gap-5" data-testid="family-detail">
          {search.created && <Alert tone="green">Família criada. O responsável principal recebeu o convite por e-mail.</Alert>}
          <Link href="/families" className="text-xs font-semibold text-primary hover:underline lg:hidden">
            ← Todas as famílias
          </Link>

          <Card>
            <div className="mb-4 flex items-center gap-4">
              <Avatar name={family.name.replace(/^Família\s+/i, "")} size={52} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-t1">{family.name}</h2>
                <div className="text-xs text-t3">
                  {family.patients.length} criança(s) · {guardians.length} responsável(is)
                </div>
              </div>
              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
            </div>
            {isStaff ? (
              <FamilyEditForm family={family} />
            ) : (
              <>
                <InfoRow label="Endereço">{family.address ?? "—"}</InfoRow>
                <InfoRow label="Contato de emergência">
                  {family.emergency_contact_name
                    ? `${family.emergency_contact_name}${family.emergency_contact_relationship ? ` (${family.emergency_contact_relationship})` : ""} · ${family.emergency_contact_phone ?? "—"}`
                    : "—"}
                </InfoRow>
              </>
            )}
          </Card>

          <Card>
            <CardTitle action={isStaff && <AddGuardianButton familyId={family.id} />}>Responsáveis</CardTitle>
            {guardians.length === 0 ? (
              <EmptyState title="Nenhum responsável vinculado" icon="👤" />
            ) : (
              <ul className="divide-y divide-line-light" data-testid="guardian-list">
                {guardians.map((guardian) =>
                  guardian.profiles ? (
                    <li key={guardian.profiles.id} className="flex flex-wrap items-center gap-3 py-3">
                      <Avatar name={guardian.profiles.full_name} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-t1">
                          {guardian.profiles.full_name}
                          {guardian.is_primary && <Badge tone="blue">Principal</Badge>}
                          {!guardian.profiles.active && <Badge tone="gray">Acesso desativado</Badge>}
                        </div>
                        <div className="text-xs text-t3">
                          {guardian.relationship} · {guardian.profiles.email}
                          {guardian.profiles.phone ? ` · ${guardian.profiles.phone}` : ""}
                        </div>
                      </div>
                      {isStaff && (
                        <GuardianActions
                          familyId={family.id}
                          profileId={guardian.profiles.id}
                          isPrimary={guardian.is_primary}
                          name={guardian.profiles.full_name}
                        />
                      )}
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle
              action={
                isStaff && (
                  <LinkButton href={`/patients/new?family=${family.id}`} variant="outline" size="sm">
                    + Adicionar criança
                  </LinkButton>
                )
              }
            >
              Crianças
            </CardTitle>
            {family.patients.length === 0 ? (
              <EmptyState title="Nenhuma criança cadastrada" icon="🧒" />
            ) : (
              <ul className="divide-y divide-line-light">
                {family.patients.map((patient) => {
                  const age = ageFrom(patient.birth_date);
                  return (
                    <li key={patient.id}>
                      <Link href={`/patients/${patient.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                        <Avatar name={patient.full_name} size={34} color="#9B59B6" />
                        <div className="flex-1 text-sm font-semibold text-t1">
                          {patient.full_name}
                          {age != null && <span className="ml-2 text-xs font-normal text-t3">{age} anos</span>}
                        </div>
                        <Badge tone={RECORD_STATUS[patient.status].tone}>{PATIENT_STATUS[patient.status]}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Observações internas</CardTitle>
            <p className="mb-3 text-xs text-t3">Não aparecem para a família no portal.</p>
            {isStaff ? (
              <InternalNotesForm familyId={family.id} notes={notes?.notes ?? ""} />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-t2">{notes?.notes || "Sem observações."}</p>
            )}
            {notes?.updated_at && (
              <div className="mt-3 text-[11px] text-t3">
                Atualizado em {formatDateTime(notes.updated_at)}
                {notes.profiles ? ` por ${notes.profiles.full_name}` : ""}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
