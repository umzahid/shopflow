"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "warning" | "info";

interface ToastInput {
  id?: string;
  title: string;
  description?: string;
  variant?: Variant;
  /** ms until auto-dismiss. Default 4000. */
  durationMs?: number;
}

interface ToastInternal extends Required<Omit<ToastInput, "id">> {
  id: string;
}

interface ToastContextValue {
  toast: (t: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

const variantStyles: Record<Variant, { container: string; iconWrap: string; Icon: typeof CheckCircle2 }> = {
  success: {
    container: "border-primary bg-surface text-foreground",
    iconWrap: "bg-primary text-primary-foreground",
    Icon: CheckCircle2,
  },
  error: {
    container: "border-danger bg-surface text-foreground",
    iconWrap: "bg-danger text-danger-foreground",
    Icon: AlertCircle,
  },
  warning: {
    container: "border-accent bg-surface text-foreground",
    iconWrap: "bg-accent text-accent-foreground",
    Icon: AlertTriangle,
  },
  info: {
    container: "border-border bg-surface text-foreground",
    iconWrap: "bg-secondary text-secondary-foreground",
    Icon: Info,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastInternal[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    counter.current += 1;
    const next: ToastInternal = {
      id: input.id ?? `toast-${counter.current}`,
      title: input.title,
      description: input.description ?? "",
      variant: input.variant ?? "info",
      durationMs: input.durationMs ?? 4000,
    };
    setItems((prev) => {
      const trimmed =
        prev.length >= MAX_VISIBLE ? prev.slice(prev.length - MAX_VISIBLE + 1) : prev;
      return [...trimmed, next];
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastInternal[];
  onDismiss: (id: string) => void;
}) {
  return (
    // aria-live="polite" so screen readers announce without stealing focus.
    <ol
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ol>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastInternal;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(t);
  }, [toast.id, toast.durationMs, onDismiss]);

  const { container, iconWrap, Icon } = variantStyles[toast.variant];

  return (
    <li
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border-2 p-3 shadow-token-lg",
        container,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          iconWrap,
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
        <p className="font-heading text-sm font-semibold leading-tight">
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-sm leading-snug text-muted-foreground">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <X className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      </button>
    </li>
  );
}
