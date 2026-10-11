import Link from "next/link";
import { ROLE_LABELS, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/format";
import { Avatar, EmptyState, cn } from "@/components/ui/primitives";
import { ChatThread, type ChatMessage } from "./chat-thread";
import { NewConversation } from "./new-conversation";
import { groupContacts } from "./contacts";

const MESSAGE_LIMIT = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Conversation list + selected thread (?c=<id>). Shared by the team (/messages)
// and the family portal (/portal/messages). On mobile, shows the list OR the thread.
export async function ChatView({ user, selectedId: rawSelectedId, basePath }: { user: CurrentUser; selectedId?: string; basePath: string }) {
  const supabase = await createClient();
  const selectedId = rawSelectedId && UUID_PATTERN.test(rawSelectedId) ? rawSelectedId : undefined;

  if (selectedId) {
    const now = new Date().toISOString();
    await Promise.all([
      supabase
        .from("conversation_participants")
        .update({ last_read_at: now })
        .eq("conversation_id", selectedId)
        .eq("profile_id", user.id),
      supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("user_id", user.id)
        .eq("kind", "message")
        .is("read_at", null)
        .like("link", `%${selectedId}`),
    ]);
  }

  const [{ data: conversations }, { data: contacts }] = await Promise.all([
    supabase.rpc("list_my_conversations"),
    supabase.rpc("list_message_contacts"),
  ]);

  const selected = conversations?.find((c) => c.conversation_id === selectedId);
  let messages: ChatMessage[] = [];
  if (selected) {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", selected.conversation_id)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_LIMIT);
    messages = (data ?? []).reverse();
  }

  const specialtyById = new Map((contacts ?? []).map((c) => [c.id, c.specialty]));
  const labelFor = (profileId: string, role: keyof typeof ROLE_LABELS) => specialtyById.get(profileId) ?? ROLE_LABELS[role];
  const groups = groupContacts(user.role, contacts ?? []);

  return (
    <div className="grid h-[calc(100vh-13rem)] min-h-[480px] overflow-hidden rounded-card border border-line bg-white shadow-card md:grid-cols-[300px_1fr]">
      <aside className={cn("min-h-0 flex-col border-line md:flex md:border-r", selected ? "hidden" : "flex")}>
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="text-sm font-bold text-t1">Conversas</div>
          <NewConversation groups={groups} roleLabels={ROLE_LABELS} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="conversation-list">
          {!conversations?.length && (
            <EmptyState title="Nenhuma conversa" description="Use “Nova conversa” para falar com alguém." icon="💬" />
          )}
          {conversations?.map((conversation) => {
            const active = conversation.conversation_id === selected?.conversation_id;
            const unread = active ? 0 : conversation.unread_count;
            const preview = conversation.last_message_body
              ? `${conversation.last_message_sender_id === user.id ? "Você: " : ""}${conversation.last_message_body}`
              : "Sem mensagens";
            return (
              <Link
                key={conversation.conversation_id}
                href={`${basePath}?c=${conversation.conversation_id}`}
                className={cn(
                  "flex items-center gap-3 border-b border-line-light px-4 py-3 transition-colors hover:bg-line-light",
                  active && "bg-primary-light",
                )}
              >
                <Avatar name={conversation.other_full_name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm text-t1", unread ? "font-bold" : "font-semibold")}>
                      {conversation.other_full_name}
                    </span>
                    {conversation.last_message_at && (
                      <span className="shrink-0 text-[10px] text-t3">{formatRelative(conversation.last_message_at)}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-t3">
                    {labelFor(conversation.other_profile_id, conversation.other_role)}
                    {!conversation.can_send && " · somente leitura"}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-xs", unread ? "font-semibold text-t1" : "text-t3")}>{preview}</span>
                    {unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white" data-testid="unread-count">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <section className={cn("min-h-0", selected ? "block" : "hidden md:block")}>
        {selected ? (
          <ChatThread
            key={selected.conversation_id}
            conversationId={selected.conversation_id}
            meId={user.id}
            otherName={selected.other_full_name}
            otherLabel={labelFor(selected.other_profile_id, selected.other_role)}
            canSend={selected.can_send}
            messages={messages}
            backHref={basePath}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-page">
            <EmptyState
              title={rawSelectedId ? "Conversa não encontrada" : "Selecione uma conversa"}
              description="Escolha uma conversa ao lado ou inicie uma nova."
              icon="💬"
            />
          </div>
        )}
      </section>
    </div>
  );
}
