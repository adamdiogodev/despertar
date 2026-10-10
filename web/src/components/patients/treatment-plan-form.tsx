"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { saveTreatmentPlan } from "@/app/(app)/patients/[id]/actions";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/primitives";

export type TreatmentPlanValues = {
  id: string;
  frequency: string | null;
  session_minutes: number | null;
  care_type: string | null;
  estimated_duration: string | null;
  chief_complaint: string | null;
  goals: string | null;
  strategies: string | null;
  home_guidance: string | null;
  materials: string | null;
  important_notes: string | null;
};

export function TreatmentPlanForm({ patientId, therapyId, plan }: { patientId: string; therapyId: string; plan?: TreatmentPlanValues }) {
  const [state, formAction] = useActionState(saveTreatmentPlan, initialActionState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} data-testid="treatment-plan-form">
      <FormMessage state={state} />
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="therapy_id" value={therapyId} />
      {plan && <input type="hidden" name="id" value={plan.id} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Frequência" name="frequency" error={errors.frequency}>
              <Input name="frequency" defaultValue={plan?.frequency ?? ""} placeholder="ex: 2x por semana" />
            </Field>
            <Field label="Duração da sessão (min)" name="session_minutes" error={errors.session_minutes}>
              <Input type="number" name="session_minutes" min={10} max={480} defaultValue={plan?.session_minutes ?? ""} placeholder="50" />
            </Field>
            <Field label="Tipo de atendimento" name="care_type" error={errors.care_type}>
              <Input name="care_type" defaultValue={plan?.care_type ?? ""} placeholder="Individual, em grupo, família..." />
            </Field>
            <Field label="Duração estimada" name="estimated_duration" error={errors.estimated_duration}>
              <Input name="estimated_duration" defaultValue={plan?.estimated_duration ?? ""} placeholder="ex: 6 meses" />
            </Field>
          </div>
          <Field label="Queixa principal / CID" name="chief_complaint" error={errors.chief_complaint}>
            <Input name="chief_complaint" defaultValue={plan?.chief_complaint ?? ""} placeholder="ex: Dificuldade de regulação emocional · F84.0" />
          </Field>
          <Field label="Objetivos terapêuticos" name="goals" error={errors.goals}>
            <Textarea name="goals" rows={4} defaultValue={plan?.goals ?? ""} />
          </Field>
          <Field label="Estratégias e abordagens" name="strategies" error={errors.strategies}>
            <Textarea name="strategies" rows={3} defaultValue={plan?.strategies ?? ""} placeholder="ex: TCC, ABA, Terapia do Brincar..." />
          </Field>
        </div>
        <div>
          <Card className="mb-4 border-primary/30 bg-primary-light/40 shadow-none">
            <div className="mb-3 text-sm font-bold text-t1">Orientações para a família</div>
            <p className="mb-3 text-xs text-t2">Visíveis aos responsáveis no portal quando o plano é publicado.</p>
            <Field label="Orientações em casa" name="home_guidance" error={errors.home_guidance}>
              <Textarea name="home_guidance" rows={4} defaultValue={plan?.home_guidance ?? ""} placeholder="O que a família pode fazer entre as sessões..." />
            </Field>
            <Field label="Materiais necessários" name="materials" error={errors.materials}>
              <Input name="materials" defaultValue={plan?.materials ?? ""} placeholder="ex: Diário de emoções, massinha, cartões..." />
            </Field>
          </Card>
          <Field label="Observações importantes (uso interno)" name="important_notes" error={errors.important_notes}>
            <Textarea name="important_notes" rows={3} defaultValue={plan?.important_notes ?? ""} placeholder="Pontos de atenção, contraindicações..." />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <SubmitButton name="intent" value="draft" variant="outline" data-testid="plan-save-draft">
          💾 Salvar rascunho
        </SubmitButton>
        <SubmitButton name="intent" value="publish" data-testid="plan-publish">
          📄 Publicar plano
        </SubmitButton>
      </div>
    </form>
  );
}
