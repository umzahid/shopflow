"use client";

import { AlertTriangle, TrendingUp, Star } from "lucide-react";
import Link from "next/link";

import { BarChart, DonutChart, type Segment } from "@/components/ui/Charts";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import {
  useMerchantDashboard,
  useMerchantReviews,
  useRestockAlerts,
  useRevenueSummary,
} from "@/lib/merchant";
import type { OrderStatus } from "@/types/api";

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#f59e0b",
  pending_review: "#9333ea",
  confirmed: "#1d4ed8",
  shipped: "#60a5fa",
  delivered: "#15803d",
  cancelled: "#dc2626",
};

function money(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function MerchantDashboardPage() {
  const dash = useMerchantDashboard();

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const revenue = useRevenueSummary(isoDate(start), isoDate(today));
  const restock = useRestockAlerts();
  const reviews = useMerchantReviews();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your store at a glance.
        </p>
      </div>

      {/* Revenue window cards */}
      <section aria-label="Revenue" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {dash.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-24" />
          ))
        ) : (
          <>
            <RevenueCard label="Last 7 days" value={dash.data?.revenue.last_7d} />
            <RevenueCard label="Last 30 days" value={dash.data?.revenue.last_30d} />
            <RevenueCard label="Last 90 days" value={dash.data?.revenue.last_90d} />
          </>
        )}
      </section>

      {/* Revenue over time + orders by status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Revenue — last 30 days" icon={<TrendingUp className="h-4 w-4" />}>
          {revenue.isLoading ? (
            <Skeleton variant="blank" className="h-44" />
          ) : (
            <BarChart
              data={(revenue.data?.series ?? []).map((p) => ({
                label: p.day.slice(5), // MM-DD
                value: Number(p.revenue),
              }))}
              format={money}
            />
          )}
        </Card>

        <Card title="Orders by status">
          {dash.isLoading ? (
            <Skeleton variant="blank" className="h-44" />
          ) : (
            <OrdersDonut
              counts={dash.data?.orders_by_status ?? []}
            />
          )}
        </Card>
      </div>

      {/* Top products + restock alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Top products">
          {dash.isLoading ? (
            <Skeleton variant="blank" className="h-40" />
          ) : (dash.data?.top_products.length ?? 0) === 0 ? (
            <Empty>No sales yet.</Empty>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {dash.data!.top_products.map((p, i) => (
                <li
                  key={p.product_id}
                  className="flex items-center gap-3 py-2.5 text-sm"
                >
                  <span className="font-heading font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {p.title}
                  </span>
                  <span className="text-muted-foreground">{p.units_sold} sold</span>
                  <span className="w-24 text-right font-semibold tabular-nums text-foreground">
                    {money(p.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title="Low-stock alerts"
          icon={<AlertTriangle className="h-4 w-4 text-danger" />}
        >
          {restock.isLoading ? (
            <Skeleton variant="blank" className="h-40" />
          ) : (restock.data?.alerts.length ?? 0) === 0 ? (
            <Empty>Nothing needs restocking — every product has enough runway.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {restock.data!.alerts.slice(0, 6).map((a) => (
                <li key={a.product_id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Link
                    href={`/merchant/products`}
                    className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-secondary"
                  >
                    {a.title}
                  </Link>
                  <span className="text-muted-foreground">stock {a.current_stock}</span>
                  <span className="w-28 text-right font-semibold text-danger">
                    {a.days_until_stockout != null
                      ? `~${a.days_until_stockout}d left`
                      : "reorder now"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent reviews (PRD scenario 31 — merchant sees reviews in dashboard) */}
      <Card title="Recent reviews" icon={<Star className="h-4 w-4 text-warning" />}>
        <div data-testid="recent-reviews">
          {reviews.isLoading ? (
            <Skeleton variant="blank" className="h-32" />
          ) : (reviews.data?.items.length ?? 0) === 0 ? (
            <Empty>No reviews yet — they appear here as customers post them.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {reviews.data!.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      role="img"
                      aria-label={`${r.rating} out of 5 stars`}
                      className="font-semibold text-warning"
                    >
                      {"★".repeat(r.rating)}
                      <span className="text-border">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {r.product_title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.body && <p className="text-muted-foreground">{r.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function RevenueCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold text-foreground">
        {value != null ? money(value) : "—"}
      </p>
    </div>
  );
}

function OrdersDonut({ counts }: { counts: { status: OrderStatus; count: number }[] }) {
  const total = counts.reduce((s, c) => s + c.count, 0);
  const segments: Segment[] = counts.map((c) => ({
    label: c.status.replace("_", " "),
    value: c.count,
    color: STATUS_COLORS[c.status] ?? "#94a3b8",
  }));
  if (total === 0) return <Empty>No orders yet.</Empty>;
  return <DonutChart segments={segments} centerValue={total} centerLabel="orders" />;
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-token-sm">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-bold text-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
