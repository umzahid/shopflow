import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatPrice(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/** UTC date as `YYYY-MM-DD`. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive `{start, end}` ISO window covering the last `n` days ending today. */
export function lastNDays(n: number): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (n - 1));
  return { start: isoDate(start), end: isoDate(today) };
}
