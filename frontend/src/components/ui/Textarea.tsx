"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  ariaLabel?: string;
  error?: string;
  helperText?: string;
  /** Show a live "used / max" counter (requires maxLength). */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, ariaLabel, error, helperText, showCount, id, className, maxLength, value, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;
  const describedBy = error ? errorId : helperText ? helperId : undefined;
  const used = typeof value === "string" ? value.length : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        aria-label={!label ? ariaLabel : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        maxLength={maxLength}
        value={value}
        className={cn(
          "min-h-[6rem] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground",
          "transition-colors placeholder:text-muted-foreground",
          "focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
          className,
        )}
        {...rest}
      />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        ) : (
          <span />
        )}
        {showCount && maxLength && (
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {used}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
});
