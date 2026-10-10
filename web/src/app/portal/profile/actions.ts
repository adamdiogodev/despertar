"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";
import { validatePassword } from "@/components/portal/rules";

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(20, "Telefone muito longo.")
    .refine((value) => value === "" || /^[\d\s()+-]{8,20}$/.test(value), "Use apenas números, espaços, parênteses e traço."),
});

export async function updateMyPhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["guardian"]);
  const parsed = phoneSchema.safeParse({ phone: formData.get("phone") ?? "" });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ phone: parsed.data.phone || null })
    .eq("id", user.id);
  if (error) return fromDb(error);
  revalidatePath("/portal/profile");
  return success("Telefone atualizado.");
}

const dataUpdateSchema = z.object({
  familyId: z.string().uuid("Escolha a família."),
  patientId: z.union([z.literal(""), z.string().guid()]),
  message: z.string().trim().min(5, "Conte o que precisa ser atualizado.").max(4000),
});

export async function requestDataUpdate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["guardian"]);
  const parsed = dataUpdateSchema.safeParse({
    familyId: formData.get("familyId"),
    patientId: formData.get("patientId") ?? "",
    message: formData.get("message"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  let familyId = parsed.data.familyId;
  if (parsed.data.patientId) {
    // A chosen child pins the request to that child's family.
    const { data: patient } = await supabase.from("patients").select("family_id").eq("id", parsed.data.patientId).maybeSingle();
    if (!patient) return failure("Criança não encontrada.", { patientId: ["Escolha a criança."] });
    familyId = patient.family_id;
  }
  // RLS checks that the family (and child, if any) belong to this guardian.
  const { error } = await supabase.from("guardian_requests").insert({
    family_id: familyId,
    patient_id: parsed.data.patientId || null,
    requested_by: user.id,
    request_type: "data_update",
    message: parsed.data.message,
  });
  if (error) return fromDb(error);
  revalidatePath("/portal/profile");
  return success("Solicitação enviada! A recepção vai atualizar seus dados e retornar.");
}

export async function changeMyPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["guardian"]);
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const problem = validatePassword(password, confirmation);
  if (problem) {
    const field = problem.includes("confirmação") ? "confirmation" : "password";
    return failure(problem, { [field]: [problem] });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return failure("A nova senha precisa ser diferente da atual.", { password: ["Escolha uma senha diferente da atual."] });
    if (error.code === "weak_password") return failure("Senha fraca. Escolha uma senha mais forte.", { password: ["Senha fraca."] });
    console.error("[auth] updateUser", error);
    return failure("Não foi possível alterar a senha. Tente novamente.");
  }
  return success("Senha alterada com sucesso.");
}
