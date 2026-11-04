import type { ReactNode } from "react";
import { cn } from "./cn";

export type CardProps = {
  /** Landmark element. Use "aside" for complementary content, "section" for a titled region. */
  as?: "section" | "aside" | "div" | "article";
  /** Used to link the heading to the region (aria-labelledby) and as an anchor target. */
  id?: string;
  title?: ReactNode;
  /** Heading level for `title` (default 2). */
  level?: 2 | 3;
  /** Right-aligned content in the header row (a price, a button…). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** The neo-brutalist white panel. With a `title` and `id` it becomes a labelled region. */
export function Card({ as: Tag = "section", id, title, level = 2, action, className, children }: CardProps) {
  const headingId = id && title ? `${id}-heading` : undefined;
  const H = level === 2 ? "h2" : "h3";
  return (
    <Tag id={id} aria-labelledby={headingId} className={cn("brut min-w-0 bg-white p-4", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && (
            <H id={headingId} className="font-[family-name:var(--font-display)] text-lg font-black leading-tight">
              {title}
            </H>
          )}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
