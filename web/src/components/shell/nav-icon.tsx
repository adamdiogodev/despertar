import {
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  HeartHandshake,
  Home,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  Receipt,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/nav";

const ICONS = {
  dashboard: LayoutGrid,
  patients: Users,
  families: HeartHandshake,
  schedule: CalendarDays,
  therapists: Stethoscope,
  documents: FolderOpen,
  reports: FileText,
  messages: MessageCircle,
  tasks: ListChecks,
  finance: Wallet,
  invoices: Receipt,
  settings: Settings,
  audit: ShieldCheck,
  home: Home,
} satisfies Record<NavIconName, unknown>;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name] ?? ClipboardList;
  return <Icon className={className} size={18} strokeWidth={2} aria-hidden />;
}
