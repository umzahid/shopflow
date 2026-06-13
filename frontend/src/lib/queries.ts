import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { PaginatedProducts, Product } from "@/types/api";

export const productKeys = {
  all: ["products"] as const,
  list: (params?: Record<string, string | number>) =>
    [...productKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
};

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
