import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";

export function MerchantCTA() {
  return (
    <section
      aria-labelledby="merchant-cta-title"
      // Block-based vibrant style: solid brand-purple panel with decorative glow.
      // No layout-shifting motion; only the arrow icon translates on hover.
      className="relative overflow-hidden rounded-2xl bg-secondary px-6 py-12 text-secondary-foreground shadow-token-xl sm:px-12 sm:py-16"
    >
      {/* Decorative blob — pointer-events:none and aria-hidden so it never
          interferes with focus or screen readers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/30 blur-3xl"
      />
      <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-xl flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-bold uppercase tracking-wide text-secondary">
            <Store className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
            For sellers
          </span>
          <h2
            id="merchant-cta-title"
            className="font-heading text-2xl font-bold leading-tight sm:text-3xl"
          >
            Reach thousands of shoppers — no storefront required.
          </h2>
          <p className="text-base leading-relaxed text-secondary-foreground/85">
            List products in minutes, ship from your own warehouse, and let
            ShopFlow handle payments, fraud screening, and customer support.
          </p>
        </div>
        <Link
          href="/merchant/apply"
          // Inverted button on the dark-purple panel: white surface with deep
          // brand text. Contrast = ~7:1, far above AA. Hover dims the surface.
          className="group inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-surface px-6 font-heading text-base font-bold text-secondary shadow-token transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
        >
          Apply to sell
          <ArrowRight
            className="h-5 w-5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
            strokeWidth={2}
          />
        </Link>
      </div>
    </section>
  );
}
