import Link from "next/link";
import { Tabs } from "@/components/ui/primitives";

// The two finance views: family charges and payouts to the team.
export function FinanceTabs({ active }: { active: "families" | "professionals" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "families", label: "Famílias", href: "/finance" },
        { key: "professionals", label: "Profissionais", href: "/finance/professionals" },
      ]}
    />
  );
}

// Secondary navigation inside the professionals view.
export function ProfessionalsSubnav({ active }: { active: "overview" | "periods" | "reports" }) {
  const links = [
    { key: "overview", label: "Visão geral", href: "/finance/professionals" },
    { key: "periods", label: "NF por período de sessões", href: "/finance/invoices" },
    { key: "reports", label: "Relatório de terapias", href: "/finance/reports" },
  ];
  return (
    <nav className="-mt-2 mb-5 flex flex-wrap gap-2" aria-label="Visão Profissionais">
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={link.key === active ? "page" : undefined}
          className={
            link.key === active
              ? "rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary"
              : "rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-t2 hover:text-t1"
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
