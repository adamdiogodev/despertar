import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Sistema Despertar" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0D2137_0%,#1A3A5C_50%,#0F2D4A_100%)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-pop">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-white">D</div>
          <h1 className="text-xl font-extrabold tracking-wide text-t1">SISTEMA DESPERTAR</h1>
          <p className="text-sm text-t2">Gestão clínica e portal das famílias</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-[11px] text-t3">
          Equipe, terapeutas e famílias usam o mesmo acesso. O perfil é definido pela clínica.
          <br />
          <Link href="/auth/forgot-password" className="font-semibold text-primary">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </main>
  );
}
