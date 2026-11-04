"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

/**
 * Accessible modal on the native <dialog>: showModal() gives focus trapping, inert background and
 * Esc-to-close for free. Clicking the backdrop also closes it. Controlled by `open`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancelOrClose = () => onClose();
    d.addEventListener("close", onCancelOrClose);
    return () => d.removeEventListener("close", onCancelOrClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // A click whose target is the <dialog> itself landed on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "modal brut m-auto w-[calc(100%-24px)] max-w-3xl overflow-hidden bg-paper p-0 text-ink backdrop:bg-ink/60 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b-[3px] border-ink bg-banana px-4 py-3">
          <div>
            <h2 id={titleId} className="text-xl font-extrabold leading-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-ink/70">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg border-2 border-ink bg-white hover:bg-paper">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
