"use client";

import {
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { RatingHistogramBar } from "@/components/RatingHistogramBar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { productGalleryUrls } from "@/lib/images";
import { useProductSummary } from "@/lib/account";
import { useProduct, useProductReviews } from "@/lib/queries";
import { recordRecentlyViewed } from "@/lib/recentlyViewed";
import { cn, formatPrice } from "@/lib/utils";
import { useCart } from "@/store/cart";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: product, isLoading, isError, error } = useProduct(id);
  const { data: reviews, isLoading: reviewsLoading } = useProductReviews(id);

  // Feed the home page's recently-viewed strip (PRD §2.2).
  useEffect(() => {
    if (product) recordRecentlyViewed(product);
  }, [product]);
  const { toast } = useToast();
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);

  const gallery = product
    ? productGalleryUrls(product, { w: 1200, h: 1200 })
    : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const outOfStock = product ? product.stock_qty <= 0 : false;
  const atCap = product ? qty >= product.stock_qty : false;
  const problem = isError && error instanceof ApiError ? error.problem : undefined;

  const handleAdd = () => {
    if (!product) return;
    add(product, qty);
    toast({
      title: `Added ${qty} ${qty === 1 ? "item" : "items"}`,
      description: product.title,
      variant: "success",
    });
  };

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link
                href="/"
                className="rounded font-medium hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Home
              </Link>
            </li>
            <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            <li>
              <Link
                href="/"
                className="rounded font-medium hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Products
              </Link>
            </li>
            <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            <li
              aria-current="page"
              className="line-clamp-1 max-w-[12rem] text-foreground sm:max-w-md"
            >
              {product?.title ?? "…"}
            </li>
          </ol>
        </nav>

        {isLoading && <ProductDetailSkeleton />}

        {isError && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
            <p className="font-heading font-semibold text-foreground">
              Couldn&apos;t load this product
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {problem?.detail ?? error?.message ?? "Unknown error"}
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-11 cursor-pointer items-center rounded-lg border-2 border-secondary px-4 font-heading text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to home
            </Link>
          </div>
        )}

        {product && (
          <>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
              {/* Gallery — main image cross-fades between thumbs; subtle
                  hover-zoom on the active image (inside overflow-hidden,
                  so no layout shift). */}
              <div className="flex flex-col gap-3 animate-fade-up">
                <div className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-token">
                  {gallery.map((src, i) => (
                    <Image
                      key={src}
                      src={src}
                      alt={i === 0 ? product.title : ""}
                      fill
                      sizes="(min-width: 1024px) 45vw, 90vw"
                      priority={i === 0}
                      className={cn(
                        "object-cover transition-[opacity,transform] duration-500 ease-out",
                        "group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                        i === activeIdx ? "opacity-100" : "opacity-0",
                      )}
                    />
                  ))}
                </div>
                {gallery.length > 1 && (
                  // Tabs must be direct children of the tablist for ARIA
                  // ownership — no list wrappers (axe: aria-required-children).
                  <div
                    role="tablist"
                    aria-label="Product images"
                    className="grid grid-cols-5 gap-2"
                  >
                    {gallery.slice(0, 5).map((img, i) => (
                      <button
                        key={img}
                        type="button"
                        role="tab"
                        aria-selected={i === activeIdx}
                        aria-label={`Show image ${i + 1}`}
                        onClick={() => setActiveIdx(i)}
                        className={cn(
                          "relative block aspect-square w-full cursor-pointer overflow-hidden rounded-md border-2 bg-muted transition-[border-color,transform] duration-200",
                          "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          "motion-reduce:transition-none motion-reduce:hover:transform-none",
                          i === activeIdx
                            ? "border-secondary"
                            : "border-border",
                        )}
                      >
                        <Image
                          src={img}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Info + buy */}
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                  <h1 className="text-balance font-heading text-3xl font-bold leading-tight text-foreground sm:text-4xl">
                    {product.title}
                  </h1>
                  <AiSummary productId={product.id} />
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          aria-hidden="true"
                          strokeWidth={1.5}
                          className={cn(
                            "h-4 w-4",
                            reviews && i <= Math.round(reviews.histogram.average)
                              ? "fill-accent text-accent"
                              : "fill-muted text-muted-foreground",
                          )}
                        />
                      ))}
                    </div>
                    {reviews && reviews.histogram.total > 0 ? (
                      <span className="tabular-nums">
                        {reviews.histogram.average.toFixed(1)} ·{" "}
                        {reviews.histogram.total}{" "}
                        {reviews.histogram.total === 1 ? "review" : "reviews"}
                      </span>
                    ) : (
                      <span>No reviews yet</span>
                    )}
                  </div>
                  <p className="font-heading text-3xl font-bold tabular-nums text-foreground">
                    {formatPrice(product.price)}
                  </p>
                  {product.description && (
                    <p className="text-base leading-relaxed text-muted-foreground">
                      {product.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <StockBadge stockQty={product.stock_qty} />
                </div>

                {/* Qty + Add to cart */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div
                    role="group"
                    aria-label="Quantity"
                    className="inline-flex h-12 items-center rounded-lg border border-border bg-surface"
                  >
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      aria-label="Decrease quantity"
                      className="inline-flex h-12 w-12 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
                    </button>
                    <span
                      aria-live="polite"
                      className="inline-flex h-12 w-12 items-center justify-center border-x border-border font-heading text-base font-bold tabular-nums"
                    >
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setQty((q) => Math.min(product.stock_qty, q + 1))
                      }
                      disabled={atCap}
                      aria-label="Increase quantity"
                      className="inline-flex h-12 w-12 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
                    </button>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    leftIcon={<ShoppingCart className="h-5 w-5" aria-hidden="true" strokeWidth={2} />}
                    disabled={outOfStock}
                    onClick={handleAdd}
                    className="sm:flex-1"
                  >
                    {outOfStock ? "Sold out" : "Add to cart"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Reviews */}
            <section
              aria-labelledby="reviews-title"
              className="mt-16 border-t border-border pt-12"
            >
              <h2
                id="reviews-title"
                className="mb-6 font-heading text-2xl font-bold text-foreground sm:text-3xl"
              >
                Reviews
              </h2>

              {reviewsLoading && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
                  <Skeleton variant="card" className="h-44" />
                  <div className="flex flex-col gap-4">
                    <Skeleton variant="row" />
                    <Skeleton variant="row" />
                  </div>
                </div>
              )}

              {reviews && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
                  <RatingHistogramBar histogram={reviews.histogram} />

                  {reviews.items.length === 0 ? (
                    <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-token-sm">
                      <p className="font-heading font-semibold text-foreground">
                        No reviews yet
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Be the first to review this product after your order
                        is delivered.
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-4">
                      {reviews.items.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-xl border border-border bg-surface p-5 shadow-token-sm"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <div
                              role="img"
                              aria-label={`${r.rating} of 5 stars`}
                              className="flex items-center gap-0.5"
                            >
                              {[1, 2, 3, 4, 5].map((i) => (
                                <Star
                                  key={i}
                                  aria-hidden="true"
                                  strokeWidth={1.5}
                                  className={cn(
                                    "h-4 w-4",
                                    i <= r.rating
                                      ? "fill-accent text-accent"
                                      : "fill-muted text-muted-foreground",
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {r.body && (
                            <p className="text-sm leading-relaxed text-foreground">
                              {r.body}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function StockBadge({ stockQty }: { stockQty: number }) {
  let label = "In stock";
  let cls = "bg-secondary/10 text-secondary";
  if (stockQty <= 0) {
    label = "Sold out";
    cls = "bg-danger text-danger-foreground";
  } else if (stockQty <= 5) {
    label = `Only ${stockQty} left`;
    cls = "bg-accent text-accent-foreground";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function AiSummary({ productId }: { productId: string }) {
  const { data, isLoading } = useProductSummary(productId);
  if (isLoading) {
    return <div className="h-5 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-hidden="true" />;
  }
  if (!data?.summary) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-secondary" aria-hidden="true" strokeWidth={2} />
      <span>
        <span className="sr-only">AI summary: </span>
        {data.summary}
      </span>
    </p>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      <Skeleton variant="blank" className="aspect-square w-full rounded-2xl" />
      <div className="flex flex-col gap-4">
        <Skeleton variant="blank" className="h-10 w-3/4 rounded" />
        <Skeleton variant="blank" className="h-5 w-1/3 rounded" />
        <Skeleton variant="blank" className="h-8 w-1/4 rounded" />
        <Skeleton variant="blank" className="h-20 w-full rounded" />
        <Skeleton variant="blank" className="h-12 w-full rounded" />
      </div>
    </div>
  );
}
