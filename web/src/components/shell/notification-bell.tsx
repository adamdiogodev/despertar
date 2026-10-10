"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { formatRelative } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { cn } from "@/components/ui/primitives";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_ICONS: Record<string, string> = {
  message: "💬",
  report: "📄",
  appointment: "📅",
  reschedule: "🔁",
  document: "📁",
  signature: "✍️",
  task: "📌",
  invoice: "🧾",
  charge: "💰",
  announcement: "📢",
  request: "📨",
  assignment: "🤝",
};

export function NotificationBell({ userId, initial, allHref }: { userId: string; initial: NotificationItem[]; allHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setItems(initial), [initial]);

  // Live updates: RLS on notifications guarantees only the user's rows arrive.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-t2 hover:bg-line-light"
        aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h4 className="text-sm font-bold">Notificações</h4>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => {
                  setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
                  startTransition(() => markAllNotificationsRead());
                }}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-8 text-center text-xs text-t3">Nenhuma notificação.</div>}
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.link ?? allHref}
                onClick={() => {
                  setOpen(false);
                  if (!item.read_at) startTransition(() => markNotificationRead(item.id));
                }}
                className={cn("flex gap-3 border-b border-line-light px-4 py-3 hover:bg-line-light", !item.read_at && "bg-primary-light/50")}
              >
                <div className="text-lg">{KIND_ICONS[item.kind] ?? "🔔"}</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-t1">{item.title}</div>
                  {item.body && <div className="line-clamp-2 text-xs text-t2">{item.body}</div>}
                  <div className="mt-0.5 text-[10px] text-t3">{formatRelative(item.created_at)}</div>
                </div>
              </Link>
            ))}
          </div>
          <Link href={allHref} onClick={() => setOpen(false)} className="block border-t border-line py-2.5 text-center text-xs font-semibold text-primary">
            Ver todas as notificações →
          </Link>
        </div>
      )}
    </div>
  );
}
