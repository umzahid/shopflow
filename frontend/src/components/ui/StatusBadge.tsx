import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/api";

/** Colour-coded badge matched to the order-status enum. */
const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pending_review: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  confirmed: "bg-secondary/10 text-secondary",
  shipped: "bg-accent/15 text-secondary",
  delivered: "bg-primary/10 text-primary",
  cancelled: "bg-danger/10 text-danger",
};

export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLES[status],
        className,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
