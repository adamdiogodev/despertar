import { ROLE_LABELS, TEAM_ROLES, requireRole } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";

// Clinic team area (admin, coordination, reception, therapists). Guardians are
// redirected to /portal by requireRole.
export default async function TeamLayout({ children }: LayoutProps<"/">) {
  const user = await requireRole(TEAM_ROLES);
  return (
    <div className="min-h-screen">
      <Sidebar groups={navFor(user.role)} userName={user.fullName} roleLabel={ROLE_LABELS[user.role]} />
      <div className="lg:pl-64">
        <Header user={user} searchPath="/search" messagesPath="/messages" notificationsPath="/notifications" />
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
