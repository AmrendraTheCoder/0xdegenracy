"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export type Preset<V extends string | number = string> = { label: ReactNode; value: V };

export type PresetGroupProps<V extends string | number> = {
  /** Accessible name of the group, e.g. "Quick amounts". */
  label: string;
  presets: Preset<V>[];
  value: V | null;
  onSelect: (v: V) => void;
  disabled?: boolean;
  className?: string;
};

/** Row of toggle buttons (aria-pressed) for quick values. */
export function PresetGroup<V extends string | number>({ label, presets, value, onSelect, disabled, className }: PresetGroupProps<V>) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-2", className)}>
      {presets.map((p) => (
        <button
          key={String(p.value)}
          type="button"
          aria-pressed={value === p.value}
          disabled={disabled}
          onClick={() => onSelect(p.value)}
          className={cn("brut-btn flex-1 py-1.5 text-sm", value === p.value ? "bg-banana" : "bg-white")}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export type NumberInputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Unit shown inside the field, e.g. "MON". */
  unit?: string;
  presets?: Preset<string>[];
  /** Help text under the field (linked via aria-describedby). */
  description?: ReactNode;
  /** Error text; marks the field invalid. */
  error?: ReactNode;
  disabled?: boolean;
  id?: string;
  /** Hide the visible label (still read by screen readers). */
  hideLabel?: boolean;
};

/** Decimal input that only accepts digits and one dot, with optional preset buttons. */
export function NumberInput({ label, value, onChange, unit, presets, description, error, disabled, id, hideLabel }: NumberInputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const descId = `${inputId}-desc`;
  const errId = `${inputId}-err`;
  const describedBy = [description && descId, error && errId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className={cn("block text-sm font-black", hideLabel && "sr-only")}>
        {label}
      </label>
      {presets && <PresetGroup label={`Quick ${label.toLowerCase()}`} presets={presets} value={value} onSelect={onChange} disabled={disabled} />}
      <div
        className={cn(
          "flex items-center rounded-xl border-[3px] border-ink bg-paper focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-grape",
          error ? "border-hot-strong" : null,
        )}
      >
        <input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            const v = e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
            const [whole, ...rest] = v.split(".");
            onChange(rest.length ? `${whole}.${rest.join("")}` : whole);
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-lg font-black outline-none"
        />
        {unit && <span className="pr-3 font-black text-ink/70" aria-hidden>{unit}</span>}
      </div>
      {description && <p id={descId} className="text-sm">{description}</p>}
      {error && <p id={errId} className="text-sm font-bold text-hot-strong">{error}</p>}
    </div>
  );
}
