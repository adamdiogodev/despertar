"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/components/ui/primitives";
import { NavIcon } from "./nav-icon";

export function Sidebar({ groups, userName, roleLabel }: { groups: NavGroup[]; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-50 rounded-lg bg-sidebar p-2 text-white lg:hidden"
        onClick={() => setMobileOpen((open) => !open)}
        aria-label="Abrir menu"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-black">D</div>
          <div>
            <div className="text-sm font-extrabold tracking-wide">SISTEMA DESPERTAR</div>
            <div className="text-[11px] text-white/50">Gestão Clínica</div>
          </div>
        </div>
        <nav className="sidebar-scroll flex-1 px-3 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/35">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href) ? "bg-primary/20 text-white" : "text-white/70 hover:bg-sidebar-hover hover:text-white",
                  )}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="truncate text-sm font-semibold">{userName}</div>
          <div className="text-[11px] text-white/50">{roleLabel}</div>
        </div>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
    </>
  );
}
