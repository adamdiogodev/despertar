import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "../auth-card";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Definir senha — Sistema Despertar" };

// Reached from /auth/confirm, which has just created the session from the e-mail link.
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard title="Link expirado" description="Este link de acesso não é mais válido.">
        <p className="mb-6 text-center text-sm text-t2">Peça um novo e-mail para definir sua senha.</p>
        <Link href="/auth/forgot-password" className="block text-center text-sm font-semibold text-primary hover:underline">
          Enviar novo link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Defina sua senha" description={user.email ? `Conta ${user.email}` : undefined}>
      <SetPasswordForm />
    </AuthCard>
  );
}
