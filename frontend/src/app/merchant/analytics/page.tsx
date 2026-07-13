"use client";

import { useState } from "react";

import { WeeklyNarrativeCard } from "@/components/merchant/WeeklyNarrativeCard";
import { BarChart, GeoHeatMap } from "@/components/ui/Charts";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { useMerchantDashboard, useRevenueSummary } from "@/lib/merchant";
import { SAMPLE_ORDERS_BY_REGION } from "@/lib/mockGeo";
import { formatPrice as money, lastNDays } from "@/lib/utils";
import type { OrderStatus } from "@/types/api";

const RANGES = [
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 180 days", value: "180" },
];

// Fulfilment funnel: each stage counts orders that reached at least that stage.
// Delivered orders also passed through shipped and confirmed, so the funnel is
// cumulative-downstream from the by-status snapshot.
function funnelFrom(counts: { status: OrderStatus; count: number }[]) {
  const by = (s: OrderStatus) => counts.find((c) => c.status === s)?.count ?? 0;
  const delivered = by("delivered");
  const shipped = delivered + by("shipped");
  const confirmed = shipped + by("confirmed");
  const placed = confirmed + by("pending") + by("pending_review") + by("cancelled");
  return [
    { label: "Placed", value: placed },
    { label: "Confirmed", value: confirmed },
    { label: "Shipped", value: shipped },
    { label: "Delivered", value: delivered },
  ];
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("90");
  const dash = useMerchantDashboard();

  const { start, end } = lastNDays(Number(range));
  const revenue = useRevenueSummary(start, end);

  const funnel = dash.data ? funnelFrom(dash.data.orders_by_status) : [];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue trends and order fulfilment.
          </p>
        </div>
        <Select
          ariaLabel="Date range"
          options={RANGES}
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="min-w-[12rem]"
        />
      </div>

      <WeeklyNarrativeCard />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
        <h2 className="mb-4 font-heading text-base font-bold text-foreground">
          Revenue over time
        </h2>
        {revenue.isLoading ? (
          <Skeleton variant="blank" className="h-48" />
        ) : (
          <BarChart
            data={(revenue.data?.series ?? []).map((p) => ({
              label: p.day.slice(5),
              value: Number(p.revenue),
            }))}
            height={220}
            format={money}
          />
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
        <h2 className="mb-4 font-heading text-base font-bold text-foreground">
          Order fulfilment funnel
        </h2>
        {dash.isLoading ? (
          <Skeleton variant="blank" className="h-40" />
        ) : funnel.every((f) => f.value === 0) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {funnel.map((stage) => (
              <li key={stage.label} className="flex items-center gap-3">
                <span className="w-24 text-sm font-medium text-foreground">
                  {stage.label}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded-md bg-muted">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground transition-[width] motion-reduce:transition-none"
                    style={{ width: `${Math.max(6, (stage.value / funnelMax) * 100)}%` }}
                  >
                    {stage.value}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">
            Orders by region
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sample data
          </span>
        </div>
        <GeoHeatMap regions={SAMPLE_ORDERS_BY_REGION} />
      </section>
    </div>
  );
}
