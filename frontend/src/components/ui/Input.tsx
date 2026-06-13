"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Show character count next to label when maxLength is set. */
  showCount?: boolean;
  /** Larger height for hero-prominent inputs. Renamed from native HTMLInputElement.size. */
  inputSize?: "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    showCount,
    inputSize = "md",
    id,
    className,
    value,
    maxLength,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : helperText ? helperId : undefined;
  const length = typeof value === "string" ? value.length : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {(label || (showCount && maxLength)) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label
              htmlFor={inputId}
              className="text-sm font-semibold text-foreground"
            >
              {label}
            </label>
          )}
          {showCount && maxLength && (
            <span
              className="text-xs text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
      <input
        ref={ref}
        id={inputId}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          inputSize === "lg" ? "h-14 text-base px-4" : "h-11 text-sm px-3",
          "w-full rounded-lg border border-border bg-surface",
          "text-foreground placeholder:text-muted-foreground",
          "transition-colors",
          "focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
          className,
        )}
        {...rest}
      />
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
