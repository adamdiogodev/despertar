"use server";

import { redirect } from "next/navigation";
import { failure, type ActionState } from "@/lib/action-state";
import { homePathFor, type AppRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { passwordProblems } from "./password-rules";

export async function setPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  const problems = passwordProblems(password);
  if (problems.length > 0) return failure("A senha não atende aos requisitos.", { password: problems });
  if (password !== confirmation) return failure("As senhas não conferem.", { confirmation: ["Repita a mesma senha."] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return failure("Seu link expirou. Peça um novo e-mail de redefinição.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return failure("A nova senha precisa ser diferente da atual.");
    if (error.code === "weak_password") return failure("Senha fraca. " + error.message);
    console.error("[auth] set password", error);
    return failure("Não foi possível salvar a senha. Tente novamente.");
  }

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (!profile?.active) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
  redirect(homePathFor(profile.role as AppRole));
}
