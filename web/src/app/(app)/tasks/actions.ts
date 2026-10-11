"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";

const optionalUuid = z.union([z.literal(""), z.string().guid()]).transform((value) => value || null);

const taskSchema = z.object({
  title: z.string().trim().min(3, "Informe um título.").max(200),
  description: z.string().trim().max(4000).transform((value) => value || null),
  assigned_to: z.string().guid("Escolha o responsável."),
  priority: z.enum(["normal", "urgent"]),
  due_date: z.union([z.literal(""), z.iso.date()]).transform((value) => value || null),
  patient_id: optionalUuid,
});

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(TEAM_ROLES);
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    assigned_to: formData.get("assigned_to"),
    priority: formData.get("priority"),
    due_date: formData.get("due_date") ?? "",
    patient_id: formData.get("patient_id") ?? "",
  });
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  // Assignee must be an active team member the user can see (RLS on profiles).
  const { data: assignee } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", parsed.data.assigned_to)
    .eq("active", true)
    .neq("role", "guardian")
    .maybeSingle();
  if (!assignee) return failure("Responsável inválido.", { assigned_to: ["Escolha um membro ativo da equipe."] });

  if (parsed.data.patient_id) {
    const { data: patient } = await supabase.from("patients").select("id").eq("id", parsed.data.patient_id).maybeSingle();
    if (!patient) return failure("Paciente inválido.", { patient_id: ["Escolha um paciente que você acompanha."] });
  }

  const { error } = await supabase.from("tasks").insert({ ...parsed.data, created_by: user.id });
  if (error) return fromDb(error);
  revalidatePath("/tasks");
  return success("Tarefa criada.");
}

const statusSchema = z.object({ id: z.string().guid(), status: z.enum(["open", "done"]) });

export async function setTaskStatus(formData: FormData) {
  await requireRole(TEAM_ROLES);
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) console.error("[tasks.status]", error);
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  const user = await requireRole(TEAM_ROLES);
  const parsed = z.string().guid().safeParse(formData.get("id"));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", parsed.data).eq("created_by", user.id);
  if (error) console.error("[tasks.delete]", error);
  revalidatePath("/tasks");
}

const notesSchema = z.object({ content: z.string().max(20000, "Notas muito longas.") });

export async function savePersonalNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(TEAM_ROLES);
  const parsed = notesSchema.safeParse({ content: formData.get("content") ?? "" });
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_notes")
    .upsert({ profile_id: user.id, content: parsed.data.content, updated_at: new Date().toISOString() });
  if (error) return fromDb(error);
  revalidatePath("/tasks");
  return success("Notas salvas.");
}
