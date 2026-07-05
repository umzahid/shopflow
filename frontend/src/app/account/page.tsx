"use client";

import { Package } from "lucide-react";
import Link from "next/link";

import { AuthGuard } from "@/components/AuthGuard";
import { Header } from "@/components/Header";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError } from "@/lib/api";
import { useMyOrders } from "@/lib/queries";
import { useAuth } from "@/store/auth";

export default function AccountPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <AuthGuard>
          <AccountView />
        </AuthGuard>
      </main>
    </>
  );
}

function money(v: string): string {
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function AccountView() {
  const user = useAuth((s) => s.user);
  const orders = useMyOrders();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Your account</h1>
        {user && (
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-bold text-foreground">Order history</h2>

        {orders.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : orders.isError ? (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-muted-foreground">
            {orders.error instanceof ApiError ? orders.error.problem.detail : "Couldn't load your orders."}
          </p>
        ) : (orders.data?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
            <Package aria-hidden="true" strokeWidth={1.5} className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-heading font-semibold text-foreground">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When you place an order it will show up here.
            </p>
            <Link
              href="/products"
              className="mt-4 inline-flex h-11 items-center rounded-lg border-2 border-secondary px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.data!.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-token-sm transition-colors hover:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="font-mono text-xs text-muted-foreground">{o.id.slice(0, 8)}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </span>
                  <StatusBadge status={o.status} />
                  <span className="text-sm text-muted-foreground">
                    {o.items.length} item{o.items.length === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto font-heading font-bold tabular-nums text-foreground">
                    {money(o.total_amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
