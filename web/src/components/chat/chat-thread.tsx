"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { formatDate, formatTime, localDateKey } from "@/lib/format";
import { initialActionState } from "@/lib/action-state";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/ui/form";
import { Avatar, Badge, cn } from "@/components/ui/primitives";
import { markConversationRead, sendMessage } from "./actions";

export type ChatMessage = { id: string; sender_id: string; body: string; created_at: string };

export function ChatThread({
  conversationId,
  meId,
  otherName,
  otherLabel,
  canSend,
  messages,
  backHref,
}: {
  conversationId: string;
  meId: string;
  otherName: string;
  otherLabel: string;
  canSend: boolean;
  messages: ChatMessage[];
  backHref: string;
}) {
  const router = useRouter();
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [state, formAction] = useActionState(sendMessage, initialActionState);
  const formRef = useResetOnSuccess(state);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Server-rendered messages plus those received over Realtime, without duplicates.
  const all = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const message of [...messages, ...live]) byId.set(message.id, message);
    return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [messages, live]);

  // RLS applies to Realtime: only participants receive these rows.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const message = payload.new as ChatMessage;
          setLive((current) => [...current, message]);
          if (message.sender_id !== meId) {
            markConversationRead(conversationId).then(() => router.refresh());
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [all.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <Link href={backHref} className="rounded-md px-1 text-xl leading-none text-t3 hover:text-t1 md:hidden" aria-label="Voltar">
          ‹
        </Link>
        <Avatar name={otherName} size={34} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-t1">{otherName}</div>
          <div className="text-[11px] text-t3">{otherLabel}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-page px-4 py-4" data-testid="chat-messages">
        {all.length === 0 && <div className="m-auto text-xs text-t3">Nenhuma mensagem ainda. Diga olá!</div>}
        {all.map((message, index) => {
          const mine = message.sender_id === meId;
          const day = localDateKey(message.created_at);
          const showDay = index === 0 || localDateKey(all[index - 1].created_at) !== day;
          return (
            <div key={message.id} className="contents">
              {showDay && (
                <div className="my-1 self-center rounded-full bg-white px-3 py-0.5 text-[10px] font-semibold text-t3 shadow-card">
                  {formatDate(message.created_at)}
                </div>
              )}
              <div className={cn("max-w-[78%]", mine ? "self-end" : "self-start")}>
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed",
                    mine
                      ? "rounded-xl rounded-tr-none bg-primary text-white"
                      : "rounded-xl rounded-tl-none border border-line bg-white text-t1",
                  )}
                >
                  {message.body}
                </div>
                <div className="mt-0.5 text-right text-[10px] text-t3">{formatTime(message.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line bg-white px-4 py-3">
        {canSend ? (
          <form ref={formRef} action={formAction}>
            {!state.ok && <FormMessage state={state} />}
            <input type="hidden" name="conversation_id" value={conversationId} />
            <div className="flex items-end gap-2">
              <textarea
                name="body"
                required
                maxLength={4000}
                rows={1}
                placeholder="Escreva uma mensagem..."
                aria-label="Mensagem"
                data-testid="chat-input"
                className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border-[1.5px] border-line px-4 py-2 text-sm text-t1 outline-none focus:border-primary"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <SubmitButton size="sm" pendingLabel="Enviando..." className="h-10" data-testid="chat-send">
                Enviar
              </SubmitButton>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2 text-sm text-t2" data-testid="chat-read-only">
            <Badge tone="gray">Somente leitura</Badge>
            Vínculo encerrado — conversa somente leitura
          </div>
        )}
      </div>
    </div>
  );
}
