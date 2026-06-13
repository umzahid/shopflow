"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Show character count next to label when maxLength is set. */
  showCount?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, showCount, id, className, value, maxLength, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : helperText ? helperId : undefined;
  const length = typeof value === "string" ? value.length : 0;

  return (
    <div className="flex flex-col gap-1">
      {(label || (showCount && maxLength)) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label htmlFor={inputId} className="text-sm font-medium text-foreground">
              {label}
            </label>
          )}
          {showCount && maxLength && (
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
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
          "h-11 w-full rounded-md border border-border bg-background px-3 text-sm",
          "text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-danger focus-visible:ring-danger",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
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
