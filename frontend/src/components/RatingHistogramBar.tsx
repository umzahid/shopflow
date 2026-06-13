import { Star } from "lucide-react";

import type { RatingHistogram } from "@/types/api";
import { cn } from "@/lib/utils";

interface Props {
  histogram: RatingHistogram;
}

const buckets: { label: string; key: keyof Omit<RatingHistogram, "total" | "average"> }[] = [
  { label: "5", key: "five" },
  { label: "4", key: "four" },
  { label: "3", key: "three" },
  { label: "2", key: "two" },
  { label: "1", key: "one" },
];

export function RatingHistogramBar({ histogram }: Props) {
  const total = histogram.total;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-token-sm">
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-heading text-3xl font-bold tabular-nums text-foreground">
            {histogram.average.toFixed(1)}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {total} {total === 1 ? "review" : "reviews"}
          </span>
        </div>
        <div
          aria-label={`Average rating ${histogram.average.toFixed(1)} of 5`}
          className="flex items-center gap-0.5"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              aria-hidden="true"
              strokeWidth={1.5}
              className={cn(
                "h-5 w-5",
                i <= Math.round(histogram.average)
                  ? "fill-accent text-accent"
                  : "fill-muted text-muted-foreground",
              )}
            />
          ))}
        </div>
      </div>

      {/* Histogram bars. role=img + aria-label ensures the visual is announced
          coherently rather than as 5 separate items. */}
      <ul role="list" aria-label="Rating distribution" className="flex flex-col gap-1.5">
        {buckets.map(({ label, key }) => {
          const count = histogram[key];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <li
              key={key}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="w-3 font-semibold tabular-nums text-foreground">
                {label}
              </span>
              <Star
                aria-hidden="true"
                strokeWidth={1.5}
                className="h-3 w-3 fill-accent text-accent"
              />
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-secondary transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-6 text-right tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
