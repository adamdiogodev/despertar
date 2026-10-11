"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { homePathFor, type AppRole } from "@/lib/auth";

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("Informe e-mail e senha.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown e-mail and wrong password: do not leak which accounts exist.
  if (error || !data.user) return failure("E-mail ou senha inválidos.");

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).single();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return failure("Acesso desativado. Procure a administração da clínica.");
  }
  await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);
  redirect(homePathFor(profile.role as AppRole));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
