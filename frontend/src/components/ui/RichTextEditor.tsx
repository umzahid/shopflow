"use client";

import { Bold, Italic, Link as LinkIcon, List } from "lucide-react";
import { useId, useRef } from "react";

import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}

type Wrap = { before: string; after: string; linePrefix?: string; sample: string };

const ACTIONS: { icon: typeof Bold; label: string; wrap: Wrap }[] = [
  { icon: Bold, label: "Bold", wrap: { before: "**", after: "**", sample: "bold text" } },
  { icon: Italic, label: "Italic", wrap: { before: "_", after: "_", sample: "italic text" } },
  { icon: List, label: "Bullet list", wrap: { before: "", after: "", linePrefix: "- ", sample: "list item" } },
  { icon: LinkIcon, label: "Link", wrap: { before: "[", after: "](https://)", sample: "link text" } },
];

/**
 * Lightweight markdown editor: a toolbar that wraps the current selection in
 * markdown syntax, over a plain textarea. No contentEditable (fragile a11y) and
 * no editor dependency — the value is portable markdown. For product
 * descriptions and similar rich copy.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  rows = 6,
  className,
}: RichTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = useId();

  const apply = (wrap: Wrap) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || wrap.sample;

    let insert: string;
    if (wrap.linePrefix) {
      insert = selected
        .split("\n")
        .map((line) => `${wrap.linePrefix}${line}`)
        .join("\n");
    } else {
      insert = `${wrap.before}${selected}${wrap.after}`;
    }
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    // Restore focus + place caret after the inserted text.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + insert.length;
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
          {label}
        </label>
      )}
      <div className={cn("overflow-hidden rounded-lg border border-border bg-surface focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/20", className)}>
        <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
          {ACTIONS.map(({ icon: Icon, label: aLabel, wrap }) => (
            <button
              key={aLabel}
              type="button"
              aria-label={aLabel}
              title={aLabel}
              onClick={() => apply(wrap)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            </button>
          ))}
          <span className="ml-auto pr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Markdown</span>
        </div>
        <textarea
          ref={ref}
          id={fieldId}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-y bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
    </div>
  );
}
