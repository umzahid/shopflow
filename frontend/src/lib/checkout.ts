"use client";

import { api } from "@/lib/api";
import type { CartLine } from "@/store/cart";
import type { CheckoutRequest, Order } from "@/types/api";

/**
 * Push the local Zustand cart into the backend's Redis cart so the
 * /orders/checkout endpoint sees the same items. We clear the server cart
 * first to guarantee parity — local is the source of truth.
 */
export async function syncCartToServer(lines: CartLine[]): Promise<void> {
  await api<void>("/cart", { method: "DELETE" });
  for (const line of lines) {
    await api<unknown>("/cart/items", {
      method: "POST",
      body: { product_id: line.productId, qty: line.qty },
    });
  }
}

export async function placeOrder(req: CheckoutRequest): Promise<Order> {
  return api<Order>("/orders/checkout", { method: "POST", body: req });
}
