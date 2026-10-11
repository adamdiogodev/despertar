"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, fromZod, success, type ActionState } from "@/lib/action-state";

function messagesPathFor(role: string) {
  return role === "guardian" ? "/portal/messages" : "/messages";
}

const sendSchema = z.object({
  conversation_id: z.string().guid(),
  body: z.string().trim().min(1, "Escreva uma mensagem.").max(4000, "Mensagem muito longa."),
});

export async function sendMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);

  const supabase = await createClient();
  // RLS refuses the insert when the link that allowed the conversation no longer holds.
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: parsed.data.conversation_id, sender_id: user.id, body: parsed.data.body });
  if (error) {
    if (error.code === "42501") return failure("Vínculo encerrado — esta conversa é somente leitura.");
    return fromDb(error);
  }
  revalidatePath(messagesPathFor(user.role));
  return success("");
}

export async function startConversation(formData: FormData) {
  const user = await requireUser();
  const parsed = z.string().guid().safeParse(formData.get("other_profile"));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { other_profile: parsed.data });
  if (error || !data) {
    console.error("[start_conversation]", error);
    return;
  }
  redirect(`${messagesPathFor(user.role)}?c=${data}`);
}

export async function markConversationRead(conversationId: string) {
  const parsed = z.string().guid().safeParse(conversationId);
  if (!parsed.success) return;
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", parsed.data)
    .eq("profile_id", user.id);
}
