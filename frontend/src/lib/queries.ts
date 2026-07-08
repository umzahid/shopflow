import {
  useInfiniteQuery,
  useQuery,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  Category,
  Order,
  OrderTracking,
  PaginatedOrders,
  PaginatedProducts,
  PaginatedReviews,
  Product,
  ProductSearchResult,
} from "@/types/api";

export interface ProductListFilters {
  price_min?: number;
  price_max?: number;
  rating_min?: number;
  category_slug?: string;
  page_size?: number;
  sort?: "price_asc" | "price_desc";
}

export const productKeys = {
  all: ["products"] as const,
  list: (params?: Record<string, string | number>) =>
    [...productKeys.all, "list", params ?? {}] as const,
  infinite: (filters: ProductListFilters) =>
    [...productKeys.all, "infinite", filters] as const,
  search: (q: string, limit: number) =>
    [...productKeys.all, "search", { q, limit }] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
  reviews: (id: string) => [...productKeys.all, "reviews", id] as const,
};

function buildQuery(filters: ProductListFilters, cursor?: string): string {
  const sp = new URLSearchParams();
  if (filters.page_size) sp.set("page_size", String(filters.page_size));
  if (filters.price_min !== undefined) sp.set("price_min", String(filters.price_min));
  if (filters.price_max !== undefined) sp.set("price_max", String(filters.price_max));
  if (filters.rating_min !== undefined) sp.set("rating_min", String(filters.rating_min));
  if (filters.category_slug) sp.set("category_slug", filters.category_slug);
  if (filters.sort) sp.set("sort", filters.sort);
  if (cursor) sp.set("cursor", cursor);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useCategories(): UseQueryResult<Category[], Error> {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/categories"),
    // Taxonomy changes rarely — cache aggressively.
    staleTime: 5 * 60_000,
  });
}

export function useProducts(
  params: { page_size?: number; cursor?: string } = {},
): UseQueryResult<PaginatedProducts, Error> {
  const search = new URLSearchParams();
  if (params.page_size) search.set("page_size", String(params.page_size));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => api<PaginatedProducts>(`/products${qs ? `?${qs}` : ""}`),
    staleTime: 30_000,
  });
}

export function useProduct(id: string): UseQueryResult<Product, Error> {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => api<Product>(`/products/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useProductReviews(
  id: string,
): UseQueryResult<PaginatedReviews, Error> {
  return useQuery({
    queryKey: productKeys.reviews(id),
    queryFn: () => api<PaginatedReviews>(`/products/${id}/reviews`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useInfiniteProducts(
  filters: ProductListFilters,
): UseInfiniteQueryResult<{ pages: PaginatedProducts[]; pageParams: unknown[] }, Error> {
  return useInfiniteQuery({
    queryKey: productKeys.infinite(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<PaginatedProducts>(`/products${buildQuery(filters, pageParam)}`),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useProductSearch(
  q: string,
  limit = 50,
): UseQueryResult<ProductSearchResult[], Error> {
  return useQuery({
    queryKey: productKeys.search(q, limit),
    queryFn: () =>
      api<ProductSearchResult[]>(
        `/products/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      ),
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });
}

export const orderKeys = {
  all: ["orders"] as const,
  mine: () => [...orderKeys.all, "mine"] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
  tracking: (id: string) => [...orderKeys.all, "tracking", id] as const,
};

export function useOrder(id: string): UseQueryResult<Order, Error> {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => api<Order>(`/orders/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

/** The signed-in customer's own orders (GET /orders is role-scoped). */
export function useMyOrders(): UseQueryResult<PaginatedOrders, Error> {
  return useQuery({
    queryKey: orderKeys.mine(),
    queryFn: () => api<PaginatedOrders>(`/orders?page_size=50`),
    staleTime: 10_000,
  });
}

export function useOrderTracking(id: string): UseQueryResult<OrderTracking, Error> {
  return useQuery({
    queryKey: orderKeys.tracking(id),
    queryFn: () => api<OrderTracking>(`/orders/${id}/tracking`),
    enabled: !!id,
    staleTime: 30_000,
  });
}
