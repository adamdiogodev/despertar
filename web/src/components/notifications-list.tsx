import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { Badge, Button, Card, EmptyState, PageHeader, cn } from "@/components/ui/primitives";

export async function NotificationsList() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const unread = (items ?? []).filter((item) => !item.read_at).length;

  return (
    <>
      <PageHeader
        title="Notificações"
        description={unread ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia"}
        actions={
          unread > 0 && (
            <form action={markAllNotificationsRead}>
              <Button variant="ghost" size="sm">Marcar todas como lidas</Button>
            </form>
          )
        }
      />
      <Card className="p-0">
        {!items?.length && <EmptyState title="Nenhuma notificação" />}
        {items?.map((item) => (
          <Link
            key={item.id}
            href={item.link ?? "#"}
            className={cn("flex items-start gap-4 border-b border-line-light px-5 py-4 last:border-0 hover:bg-line-light", !item.read_at && "bg-primary-light/40")}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-t1">{item.title}</div>
              {item.body && <div className="text-sm text-t2">{item.body}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs text-t3">{formatDateTime(item.created_at)}</div>
              {!item.read_at && <Badge tone="blue" className="mt-1">Nova</Badge>}
            </div>
          </Link>
        ))}
      </Card>
    </>
  );
}
