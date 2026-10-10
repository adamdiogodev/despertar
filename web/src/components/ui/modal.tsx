"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "./primitives";

// Native <dialog>: focus trap, Esc to close and backdrop for free.
export function Modal({
  trigger,
  title,
  children,
  triggerVariant = "primary",
  triggerSize = "md",
  open: controlledOpen,
  onOpenChange,
  wide = false,
}: {
  trigger?: ReactNode;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerVariant?: Parameters<typeof buttonClass>[0];
  triggerSize?: Parameters<typeof buttonClass>[1];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setInternalOpen(value));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {trigger && (
        <button type="button" className={buttonClass(triggerVariant, triggerSize)} onClick={() => setOpen(true)}>
          {trigger}
        </button>
      )}
      <dialog
        ref={ref}
        onClose={close}
        onClick={(event) => event.target === ref.current && close()}
        className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl p-0 shadow-pop backdrop:bg-sidebar/60`}
      >
        {open && (
          <div>
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-bold text-t1">{title}</h3>
              <button type="button" onClick={close} className="rounded-md px-2 text-xl leading-none text-t3 hover:text-t1" aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{typeof children === "function" ? children(close) : children}</div>
          </div>
        )}
      </dialog>
    </>
  );
}
