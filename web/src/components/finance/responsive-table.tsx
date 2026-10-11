import type { ReactNode } from "react";
import { cn } from "@/components/ui/primitives";

// Table on md+ screens, stacked cards below 768px: each <td> shows its column
// name (data-label) next to the value, so nothing scrolls sideways on phones.
export function RTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("p-3 md:overflow-x-auto md:p-0", className)}>
      <table
        className={cn(
          "block w-full text-left text-sm md:table",
          "[&>thead]:hidden md:[&>thead]:table-header-group [&>tbody]:block md:[&>tbody]:table-row-group",
          "[&>tbody>tr]:mb-3 [&>tbody>tr]:block [&>tbody>tr]:rounded-lg [&>tbody>tr]:border [&>tbody>tr]:border-line [&>tbody>tr]:p-3",
          "md:[&>tbody>tr]:mb-0 md:[&>tbody>tr]:table-row md:[&>tbody>tr]:rounded-none md:[&>tbody>tr]:border-0 md:[&>tbody>tr]:p-0",
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function RTh({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-line bg-line-light px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-t3", className)}>{children}</th>;
}

export function RTd({ label, children, className, colSpan }: { label?: string; children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      data-label={label}
      className={cn(
        "flex items-start gap-3 py-1 text-t2 md:table-cell md:border-b md:border-line md:px-4 md:py-3 md:align-middle",
        label
          ? "justify-between before:shrink-0 before:pt-0.5 before:text-[11px] before:font-bold before:uppercase before:tracking-wide before:text-t3 before:content-[attr(data-label)] md:before:content-none"
          : "justify-start",
        className,
      )}
    >
      <div className={cn("min-w-0", label && "text-right md:text-left")}>{children}</div>
    </td>
  );
}
