"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, useId, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  /** Sets aria-label without rendering a visible label */
  ariaLabel?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
  selectSize?: "md" | "lg";
}

// Why a native <select>? Built-in keyboard support, free mobile system
// picker, no focus-trap complexity, screen readers already know it.
// Only style the wrapper + chevron; let the OS handle the menu surface.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    ariaLabel,
    options,
    error,
    helperText,
    selectSize = "md",
    id,
    className,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const helperId = `${selectId}-helper`;
  const errorId = `${selectId}-error`;
  const describedBy = error ? errorId : helperText ? helperId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-semibold text-foreground"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-label={!label ? ariaLabel : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            selectSize === "lg" ? "h-12 text-base" : "h-11 text-sm",
            "w-full appearance-none cursor-pointer rounded-lg border border-border bg-surface px-3 pr-10 font-medium",
            "text-foreground",
            "transition-colors",
            "focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
            className,
          )}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          strokeWidth={2}
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
