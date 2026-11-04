import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export type NoticeTone = "info" | "warn" | "error" | "success";
const TONE: Record<NoticeTone, { cls: string; icon: string }> = {
  info: { cls: "bg-paper", icon: "ℹ️" },
  warn: { cls: "bg-banana", icon: "⚠️" },
  error: { cls: "bg-hot/25", icon: "❌" },
  success: { cls: "bg-mint", icon: "✅" },
};

export type NoticeProps = {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** A button or link shown under the text. */
  action?: ReactNode;
  className?: string;
};

/** Inline callout for empty, info, warning and error states. Errors are announced (role="alert"). */
export function Notice({ tone = "info", title, children, action, className }: NoticeProps) {
  const t = TONE[tone];
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cn("rounded-lg border-2 border-ink p-3 text-sm", t.cls, className)}>
      <div className="flex gap-2">
        <span aria-hidden>{t.icon}</span>
        <div className="min-w-0 flex-1 space-y-1">
          {title && <p className="font-black">{title}</p>}
          {children && <div className="break-words">{children}</div>}
          {action && <div className="pt-1">{action}</div>}
        </div>
      </div>
    </div>
  );
}

/** Error notice with a retry button. */
export function ErrorState({ title = "Something went wrong", message, onRetry, className }: { title?: ReactNode; message?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <Notice
      tone="error"
      title={title}
      className={className}
      action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    >
      {message}
    </Notice>
  );
}
