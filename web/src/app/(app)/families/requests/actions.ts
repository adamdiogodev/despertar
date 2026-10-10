"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { requireRole, STAFF_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const answerSchema = z.object({
  id: z.guid(),
  response: z.string().trim().min(2, "Escreva a resposta.").max(4000),
});

// The guardian_requests triggers stamp responded_by/at and notify the family.
export async function answerRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const parsed = answerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardian_requests")
    .update({ status: "answered", response: parsed.data.response })
    .eq("id", parsed.data.id)
    .neq("status", "closed")
    .select("id");
  if (error) return fromDb(error);
  if (!data.length) return failure("Solicitação não encontrada ou já encerrada.");

  revalidatePath("/families/requests");
  return success("Resposta enviada à família.");
}

export async function closeRequest(id: string): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  if (!z.guid().safeParse(id).success) return failure("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase.from("guardian_requests").update({ status: "closed" }).eq("id", id);
  if (error) return fromDb(error);

  revalidatePath("/families/requests");
  return success("Solicitação encerrada.");
}
