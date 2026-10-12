"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { AuthCard } from "../auth-card";
import { safeNextPath } from "../confirm/safe-next";
import { parseAuthFragment } from "./fragment";

async function signInFromFragment(): Promise<boolean> {
  const fragment = parseAuthFragment(window.location.hash);
  if (fragment.kind !== "session") return false;
  const { error } = await createClient().auth.setSession({ access_token: fragment.accessToken, refresh_token: fragment.refreshToken });
  if (error) return false;
  window.location.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  return true;
}

// Fallback target for e-mail links that carry the session in the URL fragment
// (Supabase's default templates). /auth/confirm forwards here and the browser
// keeps the fragment; the session is stored as cookies and the user continues.
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    signInFromFragment().then((ok) => {
      if (!ok) setFailed(true);
    });
  }, []);

  if (!failed) {
    return (
      <AuthCard title="Entrando..." description="Aguarde um instante.">
        <p className="text-center text-sm text-t2">Validando o link do e-mail.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Link expirado" description="Este link de acesso não é mais válido.">
      <p className="mb-6 text-center text-sm text-t2">Peça um novo e-mail para definir sua senha.</p>
      <Link href="/auth/forgot-password" className="block text-center text-sm font-semibold text-primary hover:underline">
        Enviar novo link
      </Link>
    </AuthCard>
  );
}
