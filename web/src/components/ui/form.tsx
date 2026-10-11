"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { buttonClass, cn } from "./primitives";

const fieldBase =
  "w-full rounded-lg border-[1.5px] border-line bg-white px-3 py-2 text-sm text-t1 outline-none transition-colors focus:border-primary disabled:bg-line-light disabled:text-t3";

export function Field({ label, name, error, hint, children }: { label: string; name?: string; error?: string[]; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block" htmlFor={name}>
      <span className="mb-1.5 block text-xs font-semibold text-t2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-t3">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-medium text-danger">{error.join(" ")}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input id={props.name} className={cn(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea id={props.name} className={cn(fieldBase, "resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select id={props.name} className={cn(fieldBase, className)} {...props} />;
}

export function SubmitButton({
  children,
  pendingLabel = "Salvando...",
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { pendingLabel?: string; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1] }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} className={buttonClass(variant, size, className)} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={cn("mb-4 rounded-lg px-3 py-2 text-sm font-medium", state.ok ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger")}
    >
      {state.message}
    </div>
  );
}

// Resets a form after a successful submission.
export function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}
