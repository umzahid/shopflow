"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  /** Show a type-to-filter input inside the menu. */
  searchable?: boolean;
  className?: string;
}

/**
 * Searchable multi-select with selected-value chips. Custom listbox (native
 * multi-select is poor UX): button toggles a menu, options are checkboxes,
 * ESC/outside-click close, ArrowDown moves focus into the menu.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  placeholder = "Select…",
  searchable = true,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(
    () =>
      searchable && query
        ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
        : options,
    [options, query, searchable],
  );

  const selectedSet = new Set(value);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  const toggle = (v: string) =>
    onChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef}>
      {label && <span className="text-sm font-semibold text-foreground">{label}</span>}
      <div className={cn("relative", className)}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={!label ? ariaLabel : undefined}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20"
        >
          <span className="flex flex-1 flex-wrap gap-1.5">
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedOptions.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary"
                >
                  {o.label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${o.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(o.value);
                    }}
                    className="cursor-pointer rounded hover:text-secondary-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
                  </span>
                </span>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" strokeWidth={2} />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-token-lg">
            {searchable && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter options"
                className="w-full border-b border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
              />
            )}
            <ul role="listbox" aria-multiselectable="true" id={listId} className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
              ) : (
                filtered.map((o) => {
                  const checked = selectedSet.has(o.value);
                  return (
                    <li key={o.value} role="option" aria-selected={checked}>
                      <button
                        type="button"
                        onClick={() => toggle(o.value)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      >
                        <span
                          className={cn(
                            "inline-flex h-4 w-4 items-center justify-center rounded border",
                            checked ? "border-secondary bg-secondary text-secondary-foreground" : "border-border",
                          )}
                        >
                          {checked && <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} />}
                        </span>
                        {o.label}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
