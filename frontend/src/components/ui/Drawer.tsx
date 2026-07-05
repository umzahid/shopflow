"use client";

import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Element labels the drawer title for ARIA. Hide visually if needed. */
  hideTitle?: boolean;
  side?: "right" | "left";
  children: ReactNode;
  /** Optional footer content (e.g., Subtotal + Checkout button for cart). */
  footer?: ReactNode;
  /** Width in `w-*` Tailwind unit; default w-full max-w-md. */
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({
  open,
  onClose,
  title,
  hideTitle,
  side = "right",
  children,
  footer,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // ESC to close + restore focus on close
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);

    // Lock body scroll while drawer is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the drawer on open
    const firstFocusable =
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  // Trap Tab cycling inside the panel
  const handleTabTrap = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => !el.hasAttribute("data-focus-ignore"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (typeof window === "undefined") return null;
  if (!open) return null;

  const sideCls = side === "right" ? "right-0" : "left-0";
  const enterCls = side === "right" ? "animate-slide-in-right" : "animate-slide-in-left";

  return createPortal(
    <div
      // 40-60% black scrim per Material; backdrop-blur for spatial focus.
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm motion-reduce:backdrop-blur-none"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleTabTrap}
        className={cn(
          "absolute top-0 h-full w-full max-w-md bg-surface shadow-token-xl",
          "flex flex-col",
          sideCls,
          enterCls,
          className,
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2
            id={titleId}
            className={cn(
              "font-heading text-lg font-bold text-foreground",
              hideTitle && "sr-only",
            )}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <X className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="border-t border-border bg-muted/40 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
