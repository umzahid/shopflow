"use client";

import { History } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { useRecentlyViewed } from "@/lib/recentlyViewed";
import { formatPrice } from "@/lib/utils";

// Horizontal strip of the shopper's last-viewed products (PRD §2.2). Renders
// nothing until hydration and when there's no history — no empty-state chrome.
export function RecentlyViewed() {
  const items = useRecentlyViewed();
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="recently-viewed-title"
      data-testid="recently-viewed"
      className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8"
    >
      <div className="mb-6 flex items-center gap-2">
        <History className="h-5 w-5 text-secondary" aria-hidden="true" strokeWidth={2} />
        <h2
          id="recently-viewed-title"
          className="font-heading text-2xl font-bold text-foreground sm:text-3xl"
        >
          Recently viewed
        </h2>
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {items.map((item, i) => (
          <li
            key={item.id}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <Link
              href={`/products/${item.id}`}
              className="group block overflow-hidden rounded-xl border border-border bg-surface shadow-token-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:transform-none"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <Image
                  src={item.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 12vw, (min-width: 640px) 22vw, 45vw"
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </div>
              <div className="flex flex-col gap-0.5 p-2.5">
                <span className="line-clamp-1 text-xs font-medium text-foreground">
                  {item.title}
                </span>
                <span className="text-xs font-semibold tabular-nums text-secondary">
                  {formatPrice(item.price)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
