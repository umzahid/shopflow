"use client";

import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { useWeeklyNarrative } from "@/lib/merchant";

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function WeeklyNarrativeCard() {
  const { mutate, data, isPending, error } = useWeeklyNarrative();

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
          <Sparkles className="h-4 w-4 text-secondary" aria-hidden="true" />
          This week at a glance
        </h2>
        {data ? (
          <button
            type="button"
            onClick={() => mutate({ refresh: true })}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {agoLabel(data.generated_at)}
          </button>
        ) : null}
      </div>

      {isPending ? (
        <div data-testid="narrative-loading" className="flex flex-col gap-2">
          <Skeleton variant="text" className="h-4 w-full" />
          <Skeleton variant="text" className="h-4 w-5/6" />
          <Skeleton variant="text" className="h-4 w-2/3" />
        </div>
      ) : error ? (
        <p className="text-sm text-danger">{error.message}</p>
      ) : data ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-foreground">{data.narrative}</p>
          {data.highlights.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {data.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Generate an AI summary of this week&apos;s revenue, top products, and stock risks.
          </p>
          <Button variant="secondary" size="sm" onClick={() => mutate()} leftIcon={<Sparkles className="h-4 w-4" />}>
            Generate weekly summary
          </Button>
        </div>
      )}
    </section>
  );
}
