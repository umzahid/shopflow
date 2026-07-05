"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

// Per design-system/shopflow/MASTER.md:
//   primary   = transaction CTA  (green) — "Add to cart", "Search", "Buy now"
//   secondary = brand action     (purple, outlined) — "Become a merchant", links
//   ghost     = chrome           (transparent) — icon-only header buttons
//   danger    = destructive      (red)
const variantStyles: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-primary shadow-token",
  secondary:
    "border-2 border-secondary bg-transparent text-secondary hover:bg-secondary hover:text-secondary-foreground focus-visible:ring-secondary",
  ghost:
    "text-foreground hover:bg-muted focus-visible:ring-secondary",
  danger:
    "bg-danger text-danger-foreground hover:opacity-90 focus-visible:ring-danger",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-11 px-4 text-sm gap-1.5",  // 44px — touch target floor (was 40 → bumped per a11y review)
  md: "h-12 px-5 text-sm gap-2",    // 48px — comfortable default
  lg: "h-14 px-6 text-base gap-2",  // 56px — hero CTA
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold cursor-pointer",
        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "focus-visible:ring-offset-background",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
