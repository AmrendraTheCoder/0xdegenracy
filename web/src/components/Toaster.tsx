"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "pending" | "success" | "error" | "info";
export type Toast = { id: string; kind: ToastKind; title: string; description?: string; href?: string; linkLabel?: string };
type ToastInput = Omit<Toast, "id"> & { id?: string };

type Api = {
  /** Shows a toast, or updates the one with the same id. Returns the id. */
  toast(t: ToastInput): string;
  dismiss(id: string): void;
};

const Ctx = createContext<Api | null>(null);

export function useToast() {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside <Toaster>");
  return api;
}

const ICON: Record<ToastKind, string> = { pending: "⏳", success: "✅", error: "❌", info: "ℹ️" };
const BG: Record<ToastKind, string> = { pending: "bg-white", success: "bg-mint", error: "bg-hot text-white", info: "bg-banana" };

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? Math.random().toString(36).slice(2);
      setToasts((ts) => {
        const next = { ...input, id } as Toast;
        return ts.some((t) => t.id === id) ? ts.map((t) => (t.id === id ? next : t)) : [...ts, next].slice(-4);
      });
      clearTimeout(timers.current.get(id));
      // Pending toasts stay until they resolve; results fade after a while.
      if (input.kind !== "pending") timers.current.set(id, setTimeout(() => dismiss(id), input.kind === "error" ? 12_000 : 8_000));
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`brut pointer-events-auto w-full max-w-sm p-3 text-sm ${BG[t.kind]}`}>
            <div className="flex items-start gap-2">
              <span className={t.kind === "pending" ? "animate-spin" : ""}>{ICON[t.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="font-black">{t.title}</div>
                {t.description && <div className="mt-0.5 break-words text-xs opacity-90">{t.description}</div>}
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold underline">
                    {t.linkLabel ?? "View on explorer ↗"}
                  </a>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="px-1 font-black opacity-60 hover:opacity-100" aria-label="Dismiss">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Short, human error text from wallet / viem errors. */
export function errorText(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string; name?: string };
  if (e?.name === "UserRejectedRequestError" || /user (rejected|denied)/i.test(e?.message ?? "")) return "You rejected the request in your wallet.";
  return (e?.shortMessage ?? e?.message ?? String(err)).split("\n")[0].slice(0, 160);
}
