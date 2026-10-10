import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialActionState: ActionState = { ok: false };

export function success(message: string): ActionState {
  return { ok: true, message };
}

export function failure(message: string, fieldErrors?: ActionState["fieldErrors"]): ActionState {
  return { ok: false, message, fieldErrors };
}

export function fromZod(error: ZodError): ActionState {
  return failure("Verifique os campos destacados.", error.flatten().fieldErrors as ActionState["fieldErrors"]);
}

// Turns database errors into messages a clinic user can act on. Business-rule
// exceptions raised in SQL already carry a pt-BR message, so they pass through.
export function fromDb(error: PostgrestError | { message: string; code?: string } | null): ActionState {
  if (!error) return failure("Erro inesperado.");
  const code = "code" in error ? error.code : undefined;
  if (code === "23P01") {
    const isRoom = error.message.includes("room");
    return failure(isRoom ? "A sala já está ocupada neste horário." : "O terapeuta já tem uma sessão neste horário.");
  }
  if (code === "23505") return failure("Registro duplicado.");
  if (code === "23503") return failure("Este registro está em uso e não pode ser removido.");
  if (code === "42501" && error.message.includes("row-level security")) {
    return failure("Você não tem permissão para esta ação.");
  }
  if (code === "42501" || code === "23514" || code === "P0001" || code === "P0002") return failure(error.message);
  console.error("[db]", error);
  return failure("Não foi possível concluir a operação. Tente novamente.");
}
