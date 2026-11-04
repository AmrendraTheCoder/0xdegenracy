"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type TabItem<T extends string> = {
  id: T;
  label: ReactNode;
  disabled?: boolean;
  /** Why the tab is disabled; shown as a tooltip and read with the tab. */
  disabledReason?: string;
  /** Classes applied while selected (e.g. a colour per tab). */
  activeClassName?: string;
};

export type TabsProps<T extends string> = {
  /** Accessible name for the tab list. */
  label: string;
  /** Prefix for tab/panel ids; must be unique on the page. */
  idPrefix: string;
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
};

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * WAI-ARIA tabs with automatic activation: ←/→ move and select, Home/End jump, disabled tabs are skipped
 * but stay discoverable via aria-disabled.
 */
export function Tabs<T extends string>({ label, idPrefix, items, value, onChange, className }: TabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(e: KeyboardEvent) {
    const enabled = items.filter((i) => !i.disabled);
    const at = enabled.findIndex((i) => i.id === value);
    let next: TabItem<T> | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabled[(at + 1) % enabled.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled.at(-1);
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("grid auto-cols-fr grid-flow-col gap-2", className)}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              if (el) refs.current.set(item.id, el);
              else refs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, item.id)}
            aria-selected={selected}
            aria-controls={selected ? panelId(idPrefix, item.id) : undefined}
            aria-disabled={item.disabled || undefined}
            aria-description={item.disabled ? item.disabledReason : undefined}
            title={item.disabled ? item.disabledReason : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => !item.disabled && onChange(item.id)}
            className={cn(
              "brut-btn py-2 text-lg uppercase",
              selected ? (item.activeClassName ?? "bg-banana") : "bg-white",
              item.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children, className }: { idPrefix: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={panelId(idPrefix, id)} aria-labelledby={tabId(idPrefix, id)} tabIndex={0} className={cn("rounded-lg", className)}>
      {children}
    </div>
  );
}
