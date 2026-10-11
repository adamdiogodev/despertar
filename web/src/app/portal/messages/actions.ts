"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";

const requestSchema = z.object({
  request_type: z.enum(["information", "reschedule", "billing", "document", "data_update", "other"]),
  patient_id: z.union([z.literal(""), z.string().guid()]).transform((value) => value || null),
  message: z.string().trim().min(1, "Descreva sua solicitação.").max(4000, "Mensagem muito longa."),
});

export async function createGuardianRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["guardian"]);
  const parsed = requestSchema.safeParse({
    request_type: formData.get("request_type"),
    patient_id: formData.get("patient_id") ?? "",
    message: formData.get("message"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  // The request belongs to the child's family, or to the guardian's (first) family
  // when no child is chosen. RLS re-checks that the guardian belongs to it.
  let familyId: string | null = null;
  if (parsed.data.patient_id) {
    const { data: patient } = await supabase.from("patients").select("family_id").eq("id", parsed.data.patient_id).maybeSingle();
    familyId = patient?.family_id ?? null;
  } else {
    const { data: link } = await supabase.from("guardians").select("family_id").eq("profile_id", user.id).limit(1).maybeSingle();
    familyId = link?.family_id ?? null;
  }
  if (!familyId) return failure("Não encontramos a família vinculada à sua conta.");

  const { error } = await supabase.from("guardian_requests").insert({
    family_id: familyId,
    patient_id: parsed.data.patient_id,
    requested_by: user.id,
    request_type: parsed.data.request_type,
    message: parsed.data.message,
  });
  if (error) return fromDb(error);
  revalidatePath("/portal/messages");
  return success("Solicitação enviada! A clínica responderá em breve.");
}
