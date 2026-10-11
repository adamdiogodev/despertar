import Link from "next/link";
import { LogOut, MessageCircle, Search } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { ROLE_LABELS, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/primitives";
import { NotificationBell } from "./notification-bell";

export async function Header({ user, searchPath, messagesPath, notificationsPath }: {
  user: CurrentUser;
  searchPath?: string;
  messagesPath: string;
  notificationsPath: string;
}) {
  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 pl-16 backdrop-blur lg:px-8">
      {searchPath ? (
        <form action={searchPath} className="relative max-w-md flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <input
            name="q"
            minLength={2}
            placeholder="Buscar pacientes, famílias, relatórios, documentos..."
            className="w-full rounded-lg border-[1.5px] border-line bg-page py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:bg-white"
          />
        </form>
      ) : (
        <div className="flex-1" />
      )}
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell userId={user.id} initial={notifications ?? []} allHref={notificationsPath} />
        <Link href={messagesPath} className="flex h-9 w-9 items-center justify-center rounded-lg text-t2 hover:bg-line-light" aria-label="Mensagens">
          <MessageCircle size={18} />
        </Link>
        <div className="mx-2 hidden h-8 w-px bg-line sm:block" />
        <div className="hidden items-center gap-2.5 sm:flex">
          <Avatar name={user.fullName} size={34} />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-t1">{user.fullName}</div>
            <div className="text-[11px] text-t3">{ROLE_LABELS[user.role]}</div>
          </div>
        </div>
        <form action={signOut}>
          <button type="submit" className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-t2 hover:bg-line-light" aria-label="Sair">
            <LogOut size={17} />
          </button>
        </form>
      </div>
    </header>
  );
}
