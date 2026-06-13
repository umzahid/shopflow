"use client";

import { Sparkles } from "lucide-react";

import { Header } from "@/components/Header";
import { MerchantCTA } from "@/components/MerchantCTA";
import { PopularTags } from "@/components/PopularTags";
import { SearchBar } from "@/components/SearchBar";
import { TrustStrip } from "@/components/TrustStrip";
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
      <main id="main">
        {/* ── Hero — Search is the CTA per marketplace pattern ────────── */}
        <section
          aria-labelledby="hero-title"
          // Vibrant block: pale lavender hero panel with decorative purple glows.
          // Section gap is generous (py-16 → py-24) per "large sections (48px+)" effect.
          className="relative overflow-hidden bg-muted/50"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-secondary/15 blur-3xl"
          />
          <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="flex flex-col items-center gap-6 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-secondary shadow-token-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
                Now serving 500+ independent merchants
              </span>
              <h1
                id="hero-title"
                className="text-balance font-heading text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl"
              >
                Discover products from{" "}
                <span className="text-secondary">independent makers</span>.
              </h1>
              <p className="max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
                Search thousands of items from verified sellers. Secure
                checkout, fast shipping, and reviews you can trust.
              </p>
              <div className="mt-2 w-full max-w-3xl">
                <SearchBar />
              </div>
              <div className="mt-1 w-full max-w-3xl">
                <PopularTags />
              </div>
            </div>
          </div>
        </section>

        {/* ── Featured products ──────────────────────────────────────── */}
        <section
          aria-labelledby="featured-title"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2
                id="featured-title"
                className="font-heading text-2xl font-bold text-foreground sm:text-3xl"
              >
                Featured products
              </h2>
              <p className="text-sm text-muted-foreground">
                Curated picks from across the marketplace.
              </p>
            </div>
            {data && data.items.length > 0 && (
              <p
                className="text-sm font-medium text-muted-foreground tabular-nums"
                aria-live="polite"
              >
                {data.items.length}{" "}
                {data.items.length === 1 ? "product" : "products"}
              </p>
            )}
          </div>

          {isLoading && <ProductCardSkeletonGrid count={8} />}

          {isError && (
            <div
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 p-6"
            >
              <p className="font-heading font-semibold text-foreground">
                Couldn&apos;t load products
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {problem?.detail ?? error?.message ?? "Unknown error"}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => refetch()}
                loading={isFetching}
              >
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !isError && data && data.items.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
              <p className="font-heading text-base font-semibold text-foreground">
                No products yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Merchants are adding inventory. Check back soon.
              </p>
            </div>
          )}

          {!isLoading && !isError && data && data.items.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>

        {/* ── Trust strip ────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <TrustStrip />
        </section>

        {/* ── Become-a-merchant CTA ──────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
          <MerchantCTA />
        </section>
      </main>

      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} ShopFlow. Made for makers.</p>
          <p>Built on FastAPI + Next.js</p>
        </div>
      </footer>
    </>
  );
}
