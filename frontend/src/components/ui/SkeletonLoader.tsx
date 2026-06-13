import { cn } from "@/lib/utils";

type Variant = "card" | "text" | "thumb" | "row";

const variantStyles: Record<Variant, string> = {
  card: "h-72 w-full rounded-lg",
  text: "h-4 w-full rounded",
  thumb: "h-12 w-12 rounded-md",
  row: "h-12 w-full rounded",
};

interface SkeletonProps {
  variant?: Variant;
  className?: string;
  /** When true, marks the skeleton itself as the live region announcing "Loading". */
  announce?: boolean;
}

/**
 * Pure-CSS pulsing placeholder. Match its size to the real content's bounding
 * box to keep CLS near zero — `card` matches ProductCard, `row` matches a
 * DataTable line.
 */
export function Skeleton({ variant = "text", className, announce }: SkeletonProps) {
  return (
    <div
      role={announce ? "status" : undefined}
      aria-label={announce ? "Loading" : undefined}
      aria-hidden={announce ? undefined : true}
      className={cn(
        "animate-pulse bg-muted motion-reduce:animate-none",
        variantStyles[variant],
        className,
      )}
    />
  );
}

interface ProductCardSkeletonProps {
  count?: number;
}

/** Grid of skeleton cards matching ProductCard's layout 1:1. */
export function ProductCardSkeletonGrid({ count = 8 }: ProductCardSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading products"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
        >
          <Skeleton variant="card" className="h-44" />
          <Skeleton variant="text" className="h-5 w-3/4" />
          <Skeleton variant="text" className="w-1/3" />
        </div>
      ))}
    </div>
  );
}
