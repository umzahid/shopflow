"use client";

import { Eye, Printer, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { useMerchantOrders, useUpdateOrderStatus } from "@/lib/merchant";
import type { Order, OrderStatus } from "@/types/api";

const STATUS_FILTERS = [
  { label: "All statuses", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Pending review", value: "pending_review" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pending_review: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  confirmed: "bg-secondary/10 text-secondary",
  shipped: "bg-accent/15 text-secondary",
  delivered: "bg-primary/10 text-primary",
  cancelled: "bg-danger/10 text-danger",
};

// Mirrors the backend order state machine (app/services/order_state.py) so the
// UI only offers valid transitions; the backend still enforces it (409 on bad).
const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  pending_review: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

function money(v: string): string {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// PRD §2.3 "print packing slip" — a minimal, printer-friendly document in a
// popup so the admin chrome (drawer, nav) never ends up on paper.
function printPackingSlip(order: Order): void {
  const a = order.shipping_address;
  const rows = order.items
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.product_id.slice(0, 8))}</td><td class="num">${it.quantity}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><title>Packing slip ${escapeHtml(order.id.slice(0, 8))}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; margin: 2rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
  p { margin: 0.15rem 0; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem; }
  th, td { border-bottom: 1px solid #cbd5e1; padding: 0.4rem 0.2rem; text-align: left; }
  .num { text-align: right; }
  .muted { color: #475569; }
</style></head><body>
<h1>ShopFlow — Packing slip</h1>
<p class="muted">Order ${escapeHtml(order.id)} · ${new Date(order.created_at).toLocaleDateString()}</p>
<h2 style="font-size:1rem;margin:1rem 0 0.25rem">Ship to</h2>
<p>${escapeHtml(a.line1)}${a.line2 ? `, ${escapeHtml(a.line2)}` : ""}</p>
<p>${escapeHtml(a.city)}${a.state ? `, ${escapeHtml(a.state)}` : ""} ${escapeHtml(a.postal_code)}</p>
<p>${escapeHtml(a.country)}</p>
<table><thead><tr><th>Item (SKU)</th><th class="num">Qty</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
  const w = window.open("", "_blank", "width=640,height=800");
  if (!w) return; // popup blocked — nothing sensible to do
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function OrderManagerPage() {
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [selected, setSelected] = useState<Order | null>(null);
  const query = useMerchantOrders(statusFilter || undefined);
  const orders = query.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
          Orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders containing your products. Update fulfilment status here.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select
          ariaLabel="Filter by status"
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | OrderStatus)}
          className="min-w-[12rem]"
        />
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {query.isLoading ? "" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
          <p className="font-heading font-semibold text-foreground">Couldn&apos;t load orders</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.error instanceof ApiError ? query.error.problem.detail : query.error.message}
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
          <p className="font-heading font-semibold text-foreground">No orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders will appear here once customers buy your products.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-token-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id} className="text-foreground">
                  <td className="px-4 py-3 font-mono text-xs">{o.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.items.length}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {money(o.total_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => setSelected(o)}
                      >
                        View
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Order ${selected.id.slice(0, 8)}` : "Order"}
      >
        {selected && <OrderDetail order={selected} onUpdated={setSelected} />}
      </Drawer>
    </div>
  );
}

// PRD §5.4: merchants must see why checkout flagged an order. Backend sets
// status=pending_review when the score crosses its review threshold.
function FraudPanel({ order }: { order: Order }) {
  if (order.fraud_score == null) return null;
  const score = Number(order.fraud_score);
  const flagged = order.status === "pending_review";
  return (
    <section
      data-testid="fraud-panel"
      className={`rounded-lg border p-3 ${
        flagged ? "border-purple-500/40 bg-purple-500/10" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            flagged
              ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
              : "bg-primary/10 text-primary"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {flagged ? "Flagged for review" : "Fraud screening passed"}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          Risk score {score.toFixed(2)}
        </span>
      </div>
      {flagged && order.fraud_reasons && order.fraud_reasons.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
          {order.fraud_reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderDetail({
  order,
  onUpdated,
}: {
  order: Order;
  onUpdated: (o: Order) => void;
}) {
  const { toast } = useToast();
  const update = useUpdateOrderStatus();
  const nextOptions = NEXT_STATUS[order.status];

  const changeStatus = (next: OrderStatus) => {
    update.mutate(
      { id: order.id, status: next },
      {
        onSuccess: (updated) => {
          toast({ title: `Order ${next}`, variant: "success" });
          onUpdated(updated);
        },
        onError: (e) =>
          toast({
            title: "Couldn't update status",
            description: e instanceof ApiError ? e.problem.detail : e.message,
            variant: "error",
          }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Status:</span>
          <StatusBadge status={order.status} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Printer className="h-4 w-4" aria-hidden="true" />}
          onClick={() => printPackingSlip(order)}
        >
          Packing slip
        </Button>
      </div>

      <FraudPanel order={order} />

      <section>
        <h3 className="mb-2 font-heading text-sm font-bold text-foreground">Items</h3>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {it.product_id.slice(0, 8)}
              </span>
              <span className="text-muted-foreground">×{it.quantity}</span>
              <span className="w-20 text-right tabular-nums">{money(it.unit_price)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 font-heading text-sm font-bold text-foreground">Shipping to</h3>
        <address className="not-italic text-muted-foreground">
          {order.shipping_address.line1}
          {order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ""}
          <br />
          {order.shipping_address.city}
          {order.shipping_address.state ? `, ${order.shipping_address.state}` : ""}{" "}
          {order.shipping_address.postal_code}
          <br />
          {order.shipping_address.country}
        </address>
      </section>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-heading font-bold text-foreground">Total</span>
        <span className="font-heading font-bold text-foreground">
          {money(order.total_amount)}
        </span>
      </div>

      <section className="border-t border-border pt-4">
        <h3 className="mb-2 font-heading text-sm font-bold text-foreground">
          Update status
        </h3>
        {nextOptions.length === 0 ? (
          <p className="text-muted-foreground">
            This order is {order.status.replace("_", " ")} — no further transitions.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nextOptions.map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === "cancelled" ? "danger" : "primary"}
                loading={update.isPending}
                onClick={() => changeStatus(next)}
                className="capitalize"
              >
                Mark {next.replace("_", " ")}
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
