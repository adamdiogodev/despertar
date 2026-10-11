import Link from "next/link";
import { Alert } from "@/components/ui/primitives";
import { AuthCard } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Esqueci minha senha — Sistema Despertar" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/auth/forgot-password">) {
  const { expired } = await searchParams;
  return (
    <AuthCard title="Esqueci minha senha" description="Enviaremos um link para você definir uma nova senha.">
      {expired && <Alert tone="yellow">O link usado expirou ou já foi utilizado. Peça um novo abaixo.</Alert>}
      <ForgotPasswordForm />
      <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-primary hover:underline">
        Voltar para o login
      </Link>
    </AuthCard>
  );
}
