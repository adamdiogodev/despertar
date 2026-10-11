import { ROLE_LABELS, requireRole } from "@/lib/auth";
import { PORTAL_NAV } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";

// Family portal — guardians only.
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireRole(["guardian"]);
  return (
    <div className="min-h-screen">
      <Sidebar groups={[{ label: "Área da Família", items: PORTAL_NAV }]} userName={user.fullName} roleLabel={ROLE_LABELS[user.role]} />
      <div className="lg:pl-64">
        <Header user={user} messagesPath="/portal/messages" notificationsPath="/portal/notifications" />
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
