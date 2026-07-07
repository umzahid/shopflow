"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Header } from "@/components/Header";
import { MerchantCTA } from "@/components/MerchantCTA";
import { PopularTags } from "@/components/PopularTags";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { SearchBar } from "@/components/SearchBar";
import { TrustStrip } from "@/components/TrustStrip";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductCardSkeletonGrid } from "@/components/ui/SkeletonLoader";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { categoryImageUrl, categoryList, heroImageUrl } from "@/lib/images";
import { useProducts } from "@/lib/queries";
import { useCart } from "@/store/cart";
import type { Product } from "@/types/api";

export default function Home() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isFetching } = useProducts({
    page_size: 12,
  });
  const { toast } = useToast();
  const add = useCart((s) => s.add);

  const onAddToCart = (product: Product) => {
    add(product, 1);
    toast({
      title: "Added to cart",
      description: product.title,
      variant: "success",
    });
  };

  const goToSearch = (q: string) =>
    router.push(`/products?q=${encodeURIComponent(q)}`);

  const problem =
    isError && error instanceof ApiError ? error.problem : undefined;

  return (
    <>
      <Header />
      <main id="main">
        {/* ── Hero — Search is the CTA per marketplace pattern ────────── */}
        <section
          aria-labelledby="hero-title"
          // Vibrant block: hero photo behind a tinted scrim. Content fades up on mount;
          // image runs a slow Ken Burns loop (transform-only, GPU-friendly).
          // py-16 → py-28 keeps the "large sections (48px+)" rhythm.
          className="relative overflow-hidden bg-muted/50"
        >
          {/* Background image fills the section. A dark gradient scrim sits
              over it so the hero copy always reads as light-on-dark — locks
              contrast at ≥7:1 regardless of where the Ken-Burns loop is. */}
          <div aria-hidden="true" className="absolute inset-0">
            <Image
              src={heroImageUrl(2400, 1500)}
              alt=""
              fill
              priority
              sizes="100vw"
              quality={90}
              className="object-cover animate-kenburns"
            />
            {/* Dark scrim: opaque at top-left where the headline sits,
                softer at bottom-right to keep the photo visible. */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/70 to-slate-950/45" />
            {/* Cool blue ambient blob — purely decorative, slow drift. */}
            <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-blue-500/25 blur-3xl animate-blob" />
          </div>

          <div className="relative mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-32 lg:px-8">
            <div className="flex flex-col items-center gap-6 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm shadow-token-sm animate-fade-up">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
                Now serving 500+ independent merchants
              </span>
              <h1
                id="hero-title"
                // Pure white on the dark scrim → ~17:1 contrast.
                // drop-shadow keeps the title legible even in the brightest frames
                // of the Ken-Burns loop (e.g. when a shop-window highlight passes by).
                className="text-balance font-heading text-4xl font-bold leading-tight tracking-tight text-white [text-shadow:0_2px_12px_rgb(15_23_42_/_0.55)] sm:text-5xl lg:text-6xl animate-fade-up delay-100"
              >
                Discover products from{" "}
                <span className="text-blue-300">independent makers</span>.
              </h1>
              <p className="max-w-2xl text-balance text-base leading-relaxed text-slate-200 [text-shadow:0_1px_8px_rgb(15_23_42_/_0.55)] sm:text-lg animate-fade-up delay-200">
                Search thousands of items from verified sellers. Secure
                checkout, fast shipping, and reviews you can trust.
              </p>
              <div className="mt-2 w-full max-w-3xl animate-fade-up delay-300">
                <SearchBar onSearch={goToSearch} />
              </div>
              <div className="mt-1 w-full max-w-3xl animate-fade-up delay-400">
                <PopularTags onSelect={goToSearch} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Shop by category — image-backed entry tiles ───────────── */}
        <section
          aria-labelledby="categories-title"
          className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8"
        >
          <div className="mb-8 flex flex-col gap-1">
            <h2
              id="categories-title"
              className="font-heading text-2xl font-bold text-foreground sm:text-3xl"
            >
              Shop by category
            </h2>
            <p className="text-sm text-muted-foreground">
              Jump straight into the corner of the market you came for.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categoryList().map((c, i) => (
              <li
                key={c.name}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Link
                  href={c.href}
                  className="group relative block aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted shadow-token transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:transform-none"
                >
                  <Image
                    src={categoryImageUrl(c.name)}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 15vw, (min-width: 640px) 30vw, 45vw"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  {/* Bottom-up scrim guarantees label contrast on any photo. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/40 to-transparent"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-3 py-3 font-heading text-sm font-bold text-white">
                    {c.name}
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                      strokeWidth={2.5}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
            <Link
              href="/products"
              className="group inline-flex h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              See all products
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
                strokeWidth={2}
              />
            </Link>
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
              {data.items.map((p, i) => (
                <div
                  key={p.id}
                  className="animate-fade-up"
                  // Stagger entry by 40ms/item up to 8 items, then snap so the
                  // tail of the grid doesn't feel laggy on slower devices.
                  style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                >
                  <ProductCard product={p} onAddToCart={onAddToCart} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Recently viewed (localStorage, renders only with history) ─ */}
        <RecentlyViewed />

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
