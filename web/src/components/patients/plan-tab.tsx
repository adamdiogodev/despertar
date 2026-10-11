import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, EmptyState, InfoRow } from "@/components/ui/primitives";
import { TreatmentPlanForm } from "./treatment-plan-form";

export async function PlanTab({ patientId, userId, myTherapies }: { patientId: string; userId: string; myTherapies: { id: string; name: string }[] }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("treatment_plans")
    .select(
      "id, therapist_id, therapy_id, is_draft, frequency, session_minutes, care_type, estimated_duration, chief_complaint, goals, strategies, home_guidance, materials, important_notes, updated_at, therapy:therapies (name), therapist:therapists (profile:profiles (full_name))",
    )
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false });
  const plans = data ?? [];

  const editableTherapyIds = new Set(myTherapies.map((therapy) => therapy.id));
  const readOnlyPlans = plans.filter((plan) => !(plan.therapist_id === userId && editableTherapyIds.has(plan.therapy_id)));

  return (
    <div className="grid gap-6">
      <Alert tone="blue">
        👪 Apenas os campos <strong>Orientações em casa</strong> e <strong>Materiais necessários</strong> de planos publicados chegam à família. Os demais campos
        são de uso exclusivo da equipe clínica.
      </Alert>

      {myTherapies.map((therapy) => {
        const plan = plans.find((item) => item.therapist_id === userId && item.therapy_id === therapy.id);
        return (
          <Card key={therapy.id}>
            <CardTitle action={plan && <PlanStatus isDraft={plan.is_draft} updatedAt={plan.updated_at} />}>
              {plan ? "Meu plano" : "Novo plano"} · {therapy.name}
            </CardTitle>
            <TreatmentPlanForm patientId={patientId} therapyId={therapy.id} plan={plan} />
          </Card>
        );
      })}

      {readOnlyPlans.map((plan) => (
        <Card key={plan.id} data-testid="treatment-plan-readonly">
          <CardTitle action={<PlanStatus isDraft={plan.is_draft} updatedAt={plan.updated_at} />}>
            {plan.therapy?.name ?? "Plano"} · {plan.therapist?.profile?.full_name ?? "Terapeuta"}
          </CardTitle>
          <div className="grid gap-x-8 lg:grid-cols-2">
            <div>
              <InfoRow label="Frequência">{plan.frequency || "—"}</InfoRow>
              <InfoRow label="Duração da sessão">{plan.session_minutes ? `${plan.session_minutes} min` : "—"}</InfoRow>
              <InfoRow label="Tipo de atendimento">{plan.care_type || "—"}</InfoRow>
              <InfoRow label="Duração estimada">{plan.estimated_duration || "—"}</InfoRow>
              <InfoRow label="Queixa principal / CID">{plan.chief_complaint || "—"}</InfoRow>
            </div>
            <div>
              <TextBlock label="Objetivos terapêuticos" value={plan.goals} />
              <TextBlock label="Estratégias e abordagens" value={plan.strategies} />
              <TextBlock label="Orientações em casa (família)" value={plan.home_guidance} />
              <TextBlock label="Materiais necessários (família)" value={plan.materials} />
              <TextBlock label="Observações importantes" value={plan.important_notes} />
            </div>
          </div>
        </Card>
      ))}

      {myTherapies.length === 0 && readOnlyPlans.length === 0 && (
        <Card>
          <EmptyState icon="📋" title="Nenhum plano de atendimento" description="Os planos são criados pelos terapeutas vinculados ao paciente." />
        </Card>
      )}
    </div>
  );
}

function PlanStatus({ isDraft, updatedAt }: { isDraft: boolean; updatedAt: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-t3">
      <span>Atualizado em {formatDateTime(updatedAt)}</span>
      {isDraft ? <Badge tone="yellow">Rascunho</Badge> : <Badge tone="green">Publicado</Badge>}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-b border-line-light py-2.5 last:border-0">
      <div className="mb-1 text-xs text-t3">{label}</div>
      <p className="whitespace-pre-wrap text-sm text-t1">{value || "—"}</p>
    </div>
  );
}
