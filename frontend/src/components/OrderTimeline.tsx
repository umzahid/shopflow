"use client";

import { Check, Circle } from "lucide-react";

import { SLATimer } from "@/components/ui/SLATimer";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { ApiError } from "@/lib/api";
import { useOrderTracking } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Delivery tracking timeline for an order — carrier, ETA countdown, and the
 * status timeline from GET /orders/:id/tracking. */
export function OrderTimeline({ orderId }: { orderId: string }) {
  const { data, isLoading, isError, error } = useOrderTracking(orderId);

  if (isLoading) return <Skeleton variant="blank" className="h-40" />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof ApiError ? error.problem.detail : "Couldn't load tracking."}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Carrier: </span>
          <span className="font-medium text-foreground">{data.carrier}</span>
          <span className="mx-2 text-border">·</span>
          <span className="font-mono text-xs text-muted-foreground">{data.tracking_number}</span>
        </div>
        {data.estimated_delivery && (
          <SLATimer deadline={data.estimated_delivery} prefix="Est. delivery in" warnUnderMinutes={1440} />
        )}
      </div>

      <ol className="flex flex-col gap-0">
        {data.timeline.map((stage, i) => {
          const last = i === data.timeline.length - 1;
          return (
            <li key={stage.status + i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                    stage.reached
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {stage.reached ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />
                  ) : (
                    <Circle className="h-2 w-2" aria-hidden="true" />
                  )}
                </span>
                {!last && (
                  <span className={cn("w-0.5 flex-1 min-h-[1.5rem]", stage.reached ? "bg-primary" : "bg-border")} />
                )}
              </div>
              <div className={cn("pb-4", last && "pb-0")}>
                <p className={cn("font-medium", stage.reached ? "text-foreground" : "text-muted-foreground")}>
                  {stage.label}
                </p>
                {stage.timestamp && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(stage.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
