"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGER_ROLES, STAFF_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, success, type ActionState } from "@/lib/action-state";

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Informe um título.").max(160),
  body: z.string().trim().min(1, "Escreva o comunicado.").max(4000),
  audience: z.enum(["all", "staff", "guardians"]),
});

export async function createAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(STAFF_ROLES);
  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({ ...parsed.data, created_by: user.id });
  if (error) return fromDb(error);
  revalidatePath("/messages");
  return success("Comunicado publicado.");
}

export async function deleteAnnouncement(formData: FormData) {
  await requireRole(MANAGER_ROLES);
  const parsed = z.string().guid().safeParse(formData.get("id"));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", parsed.data);
  if (error) console.error("[announcements.delete]", error);
  revalidatePath("/messages");
}
