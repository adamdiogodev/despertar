import Link from "next/link";
import { STAFF_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { PatientForm } from "@/components/patients/patient-form";
import { createPatient } from "../actions";

export default async function NewPatientPage({ searchParams }: PageProps<"/patients/new">) {
  await requireRole(STAFF_ROLES);
  const { family } = await searchParams;

  const supabase = await createClient();
  const { data: families } = await supabase.from("families").select("id, name").order("name");
  const preselected = typeof family === "string" && families?.some((item) => item.id === family) ? family : undefined;

  return (
    <>
      <PageHeader
        title="Novo paciente"
        description="Cadastre o paciente vinculado a uma família."
        actions={
          <Link href="/patients" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar para pacientes
          </Link>
        }
      />
      {!families?.length && (
        <Alert tone="yellow">
          Nenhuma família cadastrada. <Link href="/families" className="underline">Cadastre a família</Link> antes do paciente.
        </Alert>
      )}
      <Card className="max-w-3xl">
        <PatientForm action={createPatient} mode="create" families={families ?? []} values={{ family_id: preselected }} />
      </Card>
    </>
  );
}
