import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { initials } from "@/lib/format";

export function cn(...values: Parameters<typeof clsx>) {
  return clsx(...values);
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  outline: "border-[1.5px] border-primary text-primary hover:bg-primary-light",
  ghost: "border border-line bg-white text-t2 hover:bg-line-light",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-ok text-white hover:opacity-90",
};
const buttonSizes: Record<ButtonSize, string> = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm" };

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-white p-5 shadow-card", className)} {...props} />;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-t1">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-t1">{title}</h1>
        {description && <p className="mt-1 text-sm text-t2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "green" | "yellow" | "red" | "blue" | "purple" | "gray";
const toneClasses: Record<Tone, string> = {
  green: "bg-ok-bg text-ok",
  yellow: "bg-warn-bg text-warn",
  red: "bg-danger-bg text-danger",
  blue: "bg-info-bg text-info",
  purple: "bg-accent-bg text-accent",
  gray: "bg-line-light text-t2",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold", toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "blue",
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <Card className={cn("relative overflow-hidden", href && "transition-shadow hover:shadow-pop")}>
      <div className={cn("absolute inset-x-0 top-0 h-1", { green: "bg-ok", yellow: "bg-warn", red: "bg-danger", blue: "bg-primary", purple: "bg-accent", gray: "bg-t3" }[tone])} />
      {icon && <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-lg", toneClasses[tone])}>{icon}</div>}
      <div className="text-xs font-semibold uppercase tracking-wide text-t3">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-t1">{value}</div>
      {hint && <div className="mt-1 text-xs text-t2">{hint}</div>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Avatar({ name, color = "#2E86DE", size = 36 }: { name: string; color?: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

export function EmptyState({ title, description, icon = "📭", action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <div className="text-sm font-bold text-t1">{title}</div>
      {description && <div className="mt-1 max-w-sm text-xs text-t2">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-line bg-line-light px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-t3", className)}>{children}</th>;
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-line px-4 py-3 align-middle text-t2", className)}>
      {children}
    </td>
  );
}

// Link-based tabs keep the active tab in the URL (?tab=), so pages stay server-rendered.
export function Tabs({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            tab.key === active ? "border-primary text-primary" : "border-transparent text-t2 hover:text-t1",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function Alert({ tone = "blue", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cn("mb-5 rounded-lg px-4 py-3 text-sm font-medium", toneClasses[tone])}>{children}</div>;
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-light py-2.5 text-sm last:border-0">
      <div className="text-t3">{label}</div>
      <div className="text-right font-semibold text-t1">{children}</div>
    </div>
  );
}
