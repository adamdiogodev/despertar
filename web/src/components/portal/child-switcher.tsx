import Link from "next/link";
import { cn } from "@/components/ui/primitives";
import { withChild } from "./rules";
import type { PortalChild } from "./data";

// Link-based selector shown only when the guardian has more than one child.
export function ChildSwitcher({ items, selectedId, basePath }: { items: PortalChild[]; selectedId: string | null; basePath: string }) {
  if (items.length < 2) return null;
  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
      active ? "border-primary bg-primary text-white" : "border-line bg-white text-t2 hover:border-primary hover:text-primary",
    );
  return (
    <nav aria-label="Escolher criança" className="mb-5 flex flex-wrap items-center gap-2" data-testid="child-switcher">
      <span className="text-xs font-semibold text-t3">Mostrando:</span>
      <Link href={basePath} className={pill(!selectedId)}>
        Todas as crianças
      </Link>
      {items.map((child) => (
        <Link key={child.id} href={withChild(basePath, child.id)} className={pill(child.id === selectedId)}>
          {child.fullName.split(" ")[0]}
        </Link>
      ))}
    </nav>
  );
}

export function ClinicContact({ phone, whatsapp, email }: { phone: string | null; whatsapp: string | null; email?: string | null }) {
  if (!phone && !whatsapp && !email) return <span>pelos canais de atendimento da clínica</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {phone && (
        <a className="font-semibold text-primary hover:underline" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
          📞 {phone}
        </a>
      )}
      {whatsapp && (
        <a
          className="font-semibold text-primary hover:underline"
          href={`https://wa.me/${whatsapp.replace(/\D/g, "").replace(/^(?!55)/, "55")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          💬 WhatsApp {whatsapp}
        </a>
      )}
      {email && (
        <a className="font-semibold text-primary hover:underline" href={`mailto:${email}`}>
          ✉ {email}
        </a>
      )}
    </span>
  );
}
