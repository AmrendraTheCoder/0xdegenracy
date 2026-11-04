import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "buy" | "sell" | "secondary" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-hot text-ink",
  buy: "bg-mint text-ink",
  sell: "bg-ink text-white",
  secondary: "bg-white text-ink",
  accent: "bg-banana text-ink",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-4 py-3 text-lg",
};

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string };

/** Class string for anything that should look like a button (e.g. a Next `<Link>`). */
export function buttonClasses({ variant = "secondary", size = "md", block, className }: StyleProps = {}) {
  return cn("brut-btn inline-flex items-center justify-center gap-2 text-center", VARIANT[variant], SIZE[size], block && "w-full", className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  StyleProps & {
    /** Shows a spinner, sets aria-busy and disables the button. */
    loading?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export function Button({ variant, size, block, loading, className, disabled, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & StyleProps & { children: ReactNode };

/** An `<a>` styled as a button. External links get rel/target and a screen-reader hint. */
export function ButtonLink({ variant, size, block, className, children, target, rel, ...rest }: ButtonLinkProps) {
  const external = target === "_blank";
  return (
    <a target={target} rel={external ? (rel ?? "noreferrer") : rel} className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-4 w-4 shrink-0 rounded-full border-[3px] border-current border-r-transparent motion-safe:animate-spin", className)}
    />
  );
}
