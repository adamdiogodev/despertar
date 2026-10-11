import "server-only";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, STAFF_ROLES, type AppRole, type CurrentUser } from "@/lib/auth";
import type { Database } from "@/lib/database.types";

// Account management. The ONLY module allowed to use the secret key, and every
// exported function checks the caller's role itself before touching it.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3457";
const SET_PASSWORD_REDIRECT = `${SITE_URL}/auth/confirm?next=/auth/set-password`;
const BAN_FOREVER = "876000h";

// Roles an admin can switch between from Configurações › Usuários. Therapists and
// guardians carry linked rows (therapists, guardians), so their role is fixed.
export const SWITCHABLE_ROLES: AppRole[] = ["admin", "coordination", "reception"];

type AccountResult = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

export type NewAccount = { email: string; fullName: string; role: AppRole; phone?: string | null };

// Admin creates any role; coordination and reception only create guardians.
async function requireCreator(role: AppRole): Promise<CurrentUser> {
  return requireRole(role === "guardian" ? STAFF_ROLES : ["admin"]);
}

export async function inviteAccount(input: NewAccount): Promise<AccountResult> {
  await requireCreator(input.role);
  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: SET_PASSWORD_REDIRECT });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.status === 422) {
      return { ok: false, message: "Já existe uma conta com este e-mail." };
    }
    console.error("[accounts] invite", error);
    return { ok: false, message: "Não foi possível enviar o convite. Tente novamente." };
  }
  const id = data.user.id;
  const phone = input.phone?.trim() || null;

  // Role lives in app_metadata (only the secret key can write it) — never user_metadata.
  const { error: metaError } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { role: input.role, full_name: input.fullName, phone },
  });
  // The signup trigger only creates the profile when app_metadata is present on insert,
  // which is not the case for invites — so the profile is written here.
  const { error: profileError } = metaError
    ? { error: metaError }
    : await admin.from("profiles").upsert({ id, role: input.role, full_name: input.fullName, email, phone });
  if (profileError) {
    console.error("[accounts] profile", profileError);
    await admin.auth.admin.deleteUser(id);
    return { ok: false, message: "Não foi possível criar a conta. Tente novamente." };
  }
  return { ok: true, id };
}

// Rolls back an account created moments ago when the rest of the flow failed
// (e.g. the family or therapist row could not be written).
export async function discardNewAccount(id: string, role: AppRole): Promise<void> {
  await requireCreator(role);
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(id);
  // Only accounts that never signed in can be discarded.
  if (data.user && !data.user.last_sign_in_at) await admin.auth.admin.deleteUser(id);
}

export async function setAccountActive(id: string, active: boolean): Promise<SimpleResult> {
  const caller = await requireRole(["admin"]);
  if (caller.id === id) return { ok: false, message: "Você não pode desativar a própria conta." };
  const admin = createAdminClient();

  const { error: banError } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : BAN_FOREVER });
  if (banError) {
    console.error("[accounts] ban", banError);
    return { ok: false, message: "Não foi possível alterar o acesso." };
  }
  const { error } = await admin.from("profiles").update({ active }).eq("id", id);
  if (error) {
    console.error("[accounts] active", error);
    return { ok: false, message: "Não foi possível alterar o acesso." };
  }
  return { ok: true };
}

export async function changeAccountRole(id: string, role: AppRole): Promise<SimpleResult> {
  const caller = await requireRole(["admin"]);
  if (caller.id === id) return { ok: false, message: "Você não pode alterar o próprio perfil." };
  if (!SWITCHABLE_ROLES.includes(role)) return { ok: false, message: "Perfil inválido." };
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("role, full_name, phone").eq("id", id).single();
  if (!profile) return { ok: false, message: "Usuário não encontrado." };
  if (!SWITCHABLE_ROLES.includes(profile.role)) {
    return { ok: false, message: "Perfis de terapeuta e responsável não podem ser trocados." };
  }

  const { error: metaError } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { role, full_name: profile.full_name, phone: profile.phone },
  });
  const { error } = metaError ? { error: metaError } : await admin.from("profiles").update({ role }).eq("id", id);
  if (error) {
    console.error("[accounts] role", error);
    return { ok: false, message: "Não foi possível alterar o perfil." };
  }
  return { ok: true };
}

// Re-sends the invite while the user never confirmed the e-mail; afterwards sends
// a password reset instead.
export async function sendAccessLink(id: string): Promise<{ ok: true; kind: "invite" | "reset" } | { ok: false; message: string }> {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user?.email) return { ok: false, message: "Usuário não encontrado." };

  if (!data.user.email_confirmed_at) {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo: SET_PASSWORD_REDIRECT });
    if (inviteError) {
      console.error("[accounts] re-invite", inviteError);
      return { ok: false, message: "Não foi possível reenviar o convite." };
    }
    return { ok: true, kind: "invite" };
  }
  const reset = await sendPasswordReset(data.user.email);
  return reset.ok ? { ok: true, kind: "reset" } : reset;
}

// Public "forgot password" flow: uses the publishable key (no secret involved).
export async function sendPasswordReset(email: string): Promise<SimpleResult> {
  const client = createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, flowType: "implicit" } },
  );
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: SET_PASSWORD_REDIRECT });
  if (error) {
    console.error("[accounts] reset", error);
    return { ok: false, message: "Não foi possível enviar o e-mail de redefinição." };
  }
  return { ok: true };
}

export type AuthInfo = { lastSignInAt: string | null; confirmed: boolean; invitedAt: string | null };

// Sign-in data lives in auth.users, which only the secret key can read.
export async function listAuthInfo(): Promise<Map<string, AuthInfo>> {
  await requireRole(["admin"]);
  const admin = createAdminClient();
  const info = new Map<string, AuthInfo>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("[accounts] list", error);
      break;
    }
    for (const user of data.users) {
      info.set(user.id, {
        lastSignInAt: user.last_sign_in_at ?? null,
        confirmed: Boolean(user.email_confirmed_at),
        invitedAt: user.invited_at ?? null,
      });
    }
    if (data.users.length < 1000) break;
  }
  return info;
}
