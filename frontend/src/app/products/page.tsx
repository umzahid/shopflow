"use client";

import {
  ChevronRight,
  Filter as FilterIcon,
  Loader2,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { ProductCard } from "@/components/ui/ProductCard";
import { Select } from "@/components/ui/Select";
import { ProductCardSkeletonGrid } from "@/components/ui/SkeletonLoader";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import {
  useCategories,
  useInfiniteProducts,
  useProductSearch,
  type ProductListFilters,
} from "@/lib/queries";
import { useCart } from "@/store/cart";
import type { Product } from "@/types/api";

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
];

interface ParsedFilters {
  q: string;
  priceMin: string;
  priceMax: string;
  category: string;
  ratingMin: string;
  sort: string;
}

const RATING_OPTIONS = [
  { label: "Any rating", value: "" },
  { label: "4 stars & up", value: "4" },
  { label: "3 stars & up", value: "3" },
  { label: "2 stars & up", value: "2" },
];

function readParams(sp: URLSearchParams): ParsedFilters {
  return {
    q: sp.get("q") ?? "",
    priceMin: sp.get("price_min") ?? "",
    priceMax: sp.get("price_max") ?? "",
    category: sp.get("category") ?? "",
    ratingMin: sp.get("rating_min") ?? "",
    sort: sp.get("sort") ?? "newest",
  };
}

function buildHref(p: ParsedFilters): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.priceMin) sp.set("price_min", p.priceMin);
  if (p.priceMax) sp.set("price_max", p.priceMax);
  if (p.category) sp.set("category", p.category);
  if (p.ratingMin) sp.set("rating_min", p.ratingMin);
  if (p.sort && p.sort !== "newest") sp.set("sort", p.sort);
  const qs = sp.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default function ProductsPage() {
  return (
    <>
      <Header />
      <main
        id="main"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
      >
        <Suspense fallback={<ProductsShell />}>
          <ProductsView />
        </Suspense>
      </main>
    </>
  );
}

function ProductsShell() {
  return <ProductCardSkeletonGrid count={8} />;
}

function ProductsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const add = useCart((s) => s.add);

  // Derived from URL — single source of truth across reloads + share links.
  const parsed = useMemo(
    () => readParams(searchParams),
    [searchParams],
  );

  const onAddToCart = useCallback(
    (product: Product) => {
      add(product, 1);
      toast({
        title: "Added to cart",
        description: product.title,
        variant: "success",
      });
    },
    [add, toast],
  );

  return (
    <>
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
            <li aria-current="page" className="font-medium text-foreground">
              {parsed.q ? `Search · "${parsed.q}"` : "All products"}
            </li>
          </ol>
        </nav>

      <PageBody
        parsed={parsed}
        onChange={(next) => router.replace(buildHref(next), { scroll: false })}
        onAddToCart={onAddToCart}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

interface BodyProps {
  parsed: ParsedFilters;
  onChange: (next: ParsedFilters) => void;
  onAddToCart: (p: Product) => void;
}

function PageBody({ parsed, onChange, onAddToCart }: BodyProps) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const isSearchMode = parsed.q.trim().length > 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      {/* Sidebar (desktop) */}
      <aside aria-label="Filters" className="hidden lg:block">
        <FilterPanel parsed={parsed} onChange={onChange} />
      </aside>

      {/* Mobile filter drawer */}
      <Drawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        title="Filters"
        side="left"
      >
        <FilterPanel
          parsed={parsed}
          onChange={(next) => {
            onChange(next);
            setFilterDrawerOpen(false);
          }}
        />
      </Drawer>

      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
              {isSearchMode ? `Results for "${parsed.q}"` : "All products"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Curated picks from independent merchants.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterDrawerOpen(true)}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
              aria-label="Open filters"
            >
              <SlidersHorizontal
                className="h-4 w-4"
                aria-hidden="true"
                strokeWidth={2}
              />
              Filters
            </button>
            <Select
              ariaLabel="Sort by"
              options={SORT_OPTIONS}
              value={parsed.sort}
              onChange={(e) =>
                onChange({ ...parsed, sort: e.target.value })
              }
              className="min-w-[10rem]"
            />
          </div>
        </div>

        {/* Active filter chips */}
        <ActiveFilters parsed={parsed} onChange={onChange} />

        {/* Grid */}
        {isSearchMode ? (
          <SearchResultsGrid q={parsed.q} onAddToCart={onAddToCart} />
        ) : (
          <InfiniteProductGrid
            filters={{
              price_min: parsed.priceMin ? Number(parsed.priceMin) : undefined,
              price_max: parsed.priceMax ? Number(parsed.priceMax) : undefined,
              rating_min: parsed.ratingMin ? Number(parsed.ratingMin) : undefined,
              category_slug: parsed.category || undefined,
              page_size: 12,
            }}
            onAddToCart={onAddToCart}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function FilterPanel({
  parsed,
  onChange,
}: {
  parsed: ParsedFilters;
  onChange: (next: ParsedFilters) => void;
}) {
  const categories = useCategories();

  // Local draft so the user can type without firing a URL change per keystroke.
  const [draft, setDraft] = useState({
    priceMin: parsed.priceMin,
    priceMax: parsed.priceMax,
    category: parsed.category,
    ratingMin: parsed.ratingMin,
  });

  useEffect(() => {
    setDraft({
      priceMin: parsed.priceMin,
      priceMax: parsed.priceMax,
      category: parsed.category,
      ratingMin: parsed.ratingMin,
    });
  }, [parsed.priceMin, parsed.priceMax, parsed.category, parsed.ratingMin]);

  const apply = () => onChange({ ...parsed, ...draft });
  const reset = () =>
    onChange({
      q: parsed.q,
      priceMin: "",
      priceMax: "",
      category: "",
      ratingMin: "",
      sort: "newest",
    });

  const categoryOptions = [
    { label: "All categories", value: "" },
    ...(categories.data ?? []).map((c) => ({ label: c.name, value: c.slug })),
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-5 shadow-token-sm"
    >
      <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
        <FilterIcon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
        Filters
      </h2>

      {categoryOptions.length > 1 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Category
          </legend>
          <Select
            ariaLabel="Filter by category"
            options={categoryOptions}
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Rating
        </legend>
        <Select
          ariaLabel="Filter by minimum rating"
          options={RATING_OPTIONS}
          value={draft.ratingMin}
          onChange={(e) => setDraft((d) => ({ ...d, ratingMin: e.target.value }))}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Price
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Min"
            aria-label="Minimum price"
            value={draft.priceMin}
            onChange={(e) =>
              setDraft((d) => ({ ...d, priceMin: e.target.value }))
            }
          />
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Max"
            aria-label="Maximum price"
            value={draft.priceMax}
            onChange={(e) =>
              setDraft((d) => ({ ...d, priceMax: e.target.value }))
            }
          />
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </div>
    </form>
  );
}

function ActiveFilters({
  parsed,
  onChange,
}: {
  parsed: ParsedFilters;
  onChange: (next: ParsedFilters) => void;
}) {
  const chips: { label: string; key: keyof ParsedFilters }[] = [];
  if (parsed.priceMin) chips.push({ label: `Min $${parsed.priceMin}`, key: "priceMin" });
  if (parsed.priceMax) chips.push({ label: `Max $${parsed.priceMax}`, key: "priceMax" });
  if (parsed.category) chips.push({ label: parsed.category, key: "category" });
  if (parsed.ratingMin) chips.push({ label: `${parsed.ratingMin}★ & up`, key: "ratingMin" });
  if (parsed.q) chips.push({ label: `"${parsed.q}"`, key: "q" });
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {chips.map(({ label, key }) => (
        <li key={key}>
          <button
            type="button"
            onClick={() => onChange({ ...parsed, [key]: "" })}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-secondary bg-secondary/10 px-3 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Remove filter ${label}`}
          >
            {label}
            <X className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function InfiniteProductGrid({
  filters,
  onAddToCart,
}: {
  filters: ProductListFilters;
  onAddToCart: (p: Product) => void;
}) {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteProducts(filters);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // IntersectionObserver: when the sentinel scrolls into view, ask for more.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const problem = isError && error instanceof ApiError ? error.problem : undefined;

  if (isLoading) return <ProductCardSkeletonGrid count={8} />;

  if (isError) {
    return (
      <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
        <p className="font-heading font-semibold text-foreground">
          Couldn&apos;t load products
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {problem?.detail ?? error?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyResults />;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} />
        ))}
      </div>
      {/* Sentinel — out of flow visually but a real focusable item-count
          summary for screen readers. */}
      <div ref={sentinelRef} className="flex items-center justify-center py-8">
        {isFetchingNextPage ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Loading more…
          </span>
        ) : !hasNextPage ? (
          <span className="text-sm text-muted-foreground">
            You&apos;ve reached the end.
          </span>
        ) : null}
      </div>
    </>
  );
}

function SearchResultsGrid({
  q,
  onAddToCart,
}: {
  q: string;
  onAddToCart: (p: Product) => void;
}) {
  const { data, isLoading, isError, error } = useProductSearch(q);
  const problem = isError && error instanceof ApiError ? error.problem : undefined;

  if (isLoading) return <ProductCardSkeletonGrid count={8} />;

  if (isError) {
    return (
      <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
        <p className="font-heading font-semibold text-foreground">
          Search failed
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {problem?.detail ?? error?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  const items = data ?? [];
  if (items.length === 0) {
    return <EmptyResults message={`No products matched "${q}". Try another search.`} />;
  }

  // "Did you mean?" — when results are sparse, the hybrid search still returns
  // its closest semantic neighbours, so surface the strongest one as a nudge.
  const sparse = items.length <= 2;
  const topAlt = items[0];

  function confidence(score: number): { label: string; tone: string } {
    if (score >= 0.7) return { label: "Strong match", tone: "bg-primary/10 text-primary" };
    if (score >= 0.4) return { label: "Good match", tone: "bg-secondary/10 text-secondary" };
    return { label: "Related", tone: "bg-muted text-muted-foreground" };
  }

  return (
    <>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {items.length} {items.length === 1 ? "match" : "matches"} found.
        Showing the top relevance hits.
      </p>
      {sparse && topAlt && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm text-foreground">
          Few exact matches — did you mean{" "}
          <Link href={`/products/${topAlt.id}`} className="font-semibold text-secondary hover:underline">
            {topAlt.title}
          </Link>
          ? Showing the closest matches by meaning.
        </p>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => {
          const c = confidence(p.relevance_score);
          return (
            <div key={p.id} className="relative">
              <span
                className={`absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-xs font-semibold ${c.tone}`}
                title={`Relevance ${p.relevance_score.toFixed(2)}`}
              >
                {c.label}
              </span>
              <ProductCard product={p} onAddToCart={onAddToCart} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function EmptyResults({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-token-sm">
      <SearchIcon
        aria-hidden="true"
        strokeWidth={1.5}
        className="mx-auto mb-3 h-10 w-10 text-muted-foreground"
      />
      <p className="font-heading text-base font-semibold text-foreground">
        Nothing here yet
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "Try clearing some filters or come back later — merchants are still adding inventory."}
      </p>
    </div>
  );
}
