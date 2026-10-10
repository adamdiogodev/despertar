"use server";

import { z } from "zod";
import { failure, success, type ActionState } from "@/lib/action-state";
import { sendPasswordReset } from "@/lib/accounts";

const SAME_ANSWER = "Se houver uma conta com este e-mail, enviaremos um link para definir uma nova senha.";

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) return failure("Informe um e-mail válido.", { email: ["E-mail inválido."] });

  // Same answer whether or not the account exists (no account enumeration).
  await sendPasswordReset(parsed.data);
  return success(SAME_ANSWER);
}
