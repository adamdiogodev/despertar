import type { AppRole } from "@/lib/auth";

export type NavIcon =
  | "dashboard"
  | "patients"
  | "families"
  | "schedule"
  | "therapists"
  | "documents"
  | "reports"
  | "messages"
  | "tasks"
  | "finance"
  | "invoices"
  | "settings"
  | "audit"
  | "home";

export type NavItem = { href: string; label: string; icon: NavIcon; roles: AppRole[] };
export type NavGroup = { label: string; items: NavItem[] };

// Access map per role (mirrors "Configurações › Permissões" of the mock, plus the
// guardian portal and the therapist's own invoices). Pages enforce it again with
// requireRole(); RLS enforces it a third time in the database.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ["admin", "coordination", "reception", "therapist"] },
      { href: "/patients", label: "Pacientes", icon: "patients", roles: ["admin", "coordination", "reception", "therapist"] },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/finance", label: "Financeiro", icon: "finance", roles: ["admin", "coordination"] },
      { href: "/families", label: "Famílias", icon: "families", roles: ["admin", "coordination", "reception", "therapist"] },
      { href: "/messages", label: "Mensagens", icon: "messages", roles: ["admin", "coordination", "reception", "therapist"] },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/schedule", label: "Agenda", icon: "schedule", roles: ["admin", "coordination", "reception", "therapist"] },
      { href: "/therapists", label: "Terapeutas", icon: "therapists", roles: ["admin", "coordination", "therapist"] },
      { href: "/documents", label: "Documentos", icon: "documents", roles: ["admin", "coordination", "therapist"] },
      { href: "/reports", label: "Relatórios", icon: "reports", roles: ["admin", "coordination", "therapist"] },
      { href: "/tasks", label: "Tarefas", icon: "tasks", roles: ["admin", "coordination", "reception", "therapist"] },
      { href: "/invoices", label: "Minhas Notas Fiscais", icon: "invoices", roles: ["therapist"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/settings", label: "Configurações", icon: "settings", roles: ["admin"] },
      { href: "/audit", label: "Auditoria", icon: "audit", roles: ["admin"] },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "Início", icon: "home", roles: ["guardian"] },
  { href: "/portal/sessions", label: "Sessões", icon: "schedule", roles: ["guardian"] },
  { href: "/portal/messages", label: "Recados", icon: "messages", roles: ["guardian"] },
  { href: "/portal/documents", label: "Documentos", icon: "documents", roles: ["guardian"] },
  { href: "/portal/finance", label: "Financeiro", icon: "finance", roles: ["guardian"] },
  { href: "/portal/profile", label: "Meu Perfil", icon: "families", roles: ["guardian"] },
];

export function navFor(role: AppRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) })).filter(
    (group) => group.items.length > 0,
  );
}
