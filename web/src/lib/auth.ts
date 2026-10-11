import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
};

export const STAFF_ROLES: AppRole[] = ["admin", "coordination", "reception"];
export const MANAGER_ROLES: AppRole[] = ["admin", "coordination"];
export const TEAM_ROLES: AppRole[] = ["admin", "coordination", "reception", "therapist"];

// Data Access Layer: the single place pages and actions learn who the user is.
// Validates the JWT with the auth server (getUser), then loads the profile.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.active) return null;

  return { id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Use in every page and server action that is not open to all roles.
export async function requireRole(roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}

export function homePathFor(role: AppRole) {
  return role === "guardian" ? "/portal" : "/dashboard";
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  coordination: "Coordenação",
  reception: "Recepção",
  therapist: "Terapeuta",
  guardian: "Responsável",
};
