import { MANAGER_ROLES, STAFF_ROLES, TEAM_ROLES, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { ChatView } from "@/components/chat/chat-view";
import { AnnouncementForm } from "./announcement-form";
import { deleteAnnouncement } from "./actions";

const AUDIENCE_LABELS = { all: "Todos", staff: "Equipe", guardians: "Famílias" } as const;
const AUDIENCE_TONES = { all: "blue", staff: "purple", guardians: "green" } as const;

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const user = await requireRole(TEAM_ROLES);
  const { tab, c } = await searchParams;
  const activeTab = tab === "announcements" ? "announcements" : "chat";
  const isStaff = STAFF_ROLES.includes(user.role);
  const isManager = MANAGER_ROLES.includes(user.role);

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Conversas com a equipe e as famílias, e comunicados da clínica"
        actions={activeTab === "announcements" && isStaff && <AnnouncementForm />}
      />
      <Tabs
        active={activeTab}
        tabs={[
          { key: "chat", label: "💬 Conversas", href: "/messages" },
          { key: "announcements", label: "📢 Comunicados", href: "/messages?tab=announcements" },
        ]}
      />
      {activeTab === "chat" ? (
        <ChatView user={user} basePath="/messages" selectedId={typeof c === "string" ? c : undefined} />
      ) : (
        <AnnouncementList canDelete={isManager} />
      )}
    </>
  );
}

async function AnnouncementList({ canDelete }: { canDelete: boolean }) {
  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, audience, created_at, author:profiles!announcements_created_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!announcements?.length) {
    return (
      <Card>
        <EmptyState title="Nenhum comunicado" icon="📢" />
      </Card>
    );
  }

  return (
    <div className="grid gap-3" data-testid="announcement-list">
      {announcements.map((announcement) => (
        <Card key={announcement.id}>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-t1">{announcement.title}</div>
              <div className="text-xs text-t3">
                {announcement.author?.full_name ?? "Clínica"} · {formatDateTime(announcement.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={AUDIENCE_TONES[announcement.audience]}>{AUDIENCE_LABELS[announcement.audience]}</Badge>
              {canDelete && (
                <form action={deleteAnnouncement}>
                  <input type="hidden" name="id" value={announcement.id} />
                  <Button variant="ghost" size="sm" aria-label="Excluir comunicado">
                    Excluir
                  </Button>
                </form>
              )}
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm text-t2">{announcement.body}</p>
        </Card>
      ))}
    </div>
  );
}
