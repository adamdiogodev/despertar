"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markNotificationRead(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", parsed.data).eq("user_id", user.id);
}
