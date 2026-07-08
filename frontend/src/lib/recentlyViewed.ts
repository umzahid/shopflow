"use client";

import { useEffect, useState } from "react";

import { productCoverUrl } from "@/lib/images";
import type { Product } from "@/types/api";

// PRD §2.2 — home page "recently viewed (localStorage)". We store a minimal
// snapshot (not the full Product) so stale prices/stock never render as truth;
// the card links to the live detail page.
export interface RecentlyViewedItem {
  id: string;
  title: string;
  price: string;
  imageUrl: string;
  viewedAt: number;
}

const STORAGE_KEY = "shopflow.recently-viewed.v1";
const MAX_ITEMS = 8;

function read(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is RecentlyViewedItem =>
        typeof it === "object" && it !== null && typeof (it as RecentlyViewedItem).id === "string",
    );
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(product: Product): void {
  if (typeof window === "undefined") return;
  const entry: RecentlyViewedItem = {
    id: product.id,
    title: product.title,
    price: product.price,
    imageUrl: productCoverUrl(product, { w: 400, h: 400 }),
    viewedAt: Date.now(),
  };
  const next = [entry, ...read().filter((it) => it.id !== product.id)].slice(0, MAX_ITEMS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full / private mode — recently-viewed is a nicety, never an error.
  }
}

// Reads after mount so SSR markup (empty) matches the first client paint.
export function useRecentlyViewed(): RecentlyViewedItem[] {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  useEffect(() => setItems(read()), []);
  return items;
}
