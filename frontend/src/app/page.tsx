"use client";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductCardSkeletonGrid } from "@/components/ui/SkeletonLoader";
import { ApiError } from "@/lib/api";
import { useProducts } from "@/lib/queries";

export default function Home() {
  const { data, isLoading, isError, error, refetch, isFetching } = useProducts({
    page_size: 12,
  });

  const problem =
    isError && error instanceof ApiError ? error.problem : undefined;

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section
          aria-labelledby="hero-title"
          className="flex flex-col items-start gap-4 py-12 sm:py-16"
        >
          <h1
            id="hero-title"
            className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            Everything for everyday life.
          </h1>
          <p className="max-w-prose text-muted-foreground">
            Hand-picked products from independent merchants. Browse, review, and
            check out — all in one place.
          </p>
        </section>

        {/* Featured products */}
        <section aria-labelledby="featured-title" className="pb-16">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 id="featured-title" className="text-xl font-semibold text-foreground">
              Featured products
            </h2>
            {data && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {data.items.length} {data.items.length === 1 ? "result" : "results"}
              </p>
            )}
          </div>

          {isLoading && <ProductCardSkeletonGrid count={8} />}

          {isError && (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm"
            >
              <p className="font-medium text-foreground">
                Couldn&apos;t load products
              </p>
              <p className="mt-1 text-muted-foreground">
                {problem?.detail ?? error?.message ?? "Unknown error"}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => refetch()}
                loading={isFetching}
              >
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !isError && data && data.items.length === 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-8 text-center">
              <p className="text-sm font-medium text-foreground">No products yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check back soon — merchants are adding inventory.
              </p>
            </div>
          )}

          {!isLoading && !isError && data && data.items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
