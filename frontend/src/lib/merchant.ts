import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CopilotResponse,
  DescriptionRequest,
  DescriptionResponse,
  MerchantDashboard,
  MerchantReviews,
  Order,
  OrderStatus,
  PaginatedOrders,
  PaginatedProducts,
  Product,
  ProductForecast,
  ProductStatus,
  RestockAlertsResponse,
  RevenueSummary,
  WeeklyNarrative,
} from "@/types/api";

export const merchantKeys = {
  all: ["merchant"] as const,
  dashboard: () => [...merchantKeys.all, "dashboard"] as const,
  revenue: (start: string, end: string) =>
    [...merchantKeys.all, "revenue", { start, end }] as const,
  restock: () => [...merchantKeys.all, "restock"] as const,
  products: (status?: string) =>
    [...merchantKeys.all, "products", status ?? "all"] as const,
  orders: (status?: string) =>
    [...merchantKeys.all, "orders", status ?? "all"] as const,
};

export function useMerchantDashboard(): UseQueryResult<MerchantDashboard, Error> {
  return useQuery({
    queryKey: merchantKeys.dashboard(),
    queryFn: () => api<MerchantDashboard>("/merchant/dashboard"),
    staleTime: 30_000,
  });
}

/** Revenue series over an inclusive [start, end] date window (YYYY-MM-DD). */
export function useRevenueSummary(
  start: string,
  end: string,
): UseQueryResult<RevenueSummary, Error> {
  return useQuery({
    queryKey: merchantKeys.revenue(start, end),
    queryFn: () =>
      api<RevenueSummary>(`/merchant/revenue-summary?start=${start}&end=${end}`),
    enabled: !!start && !!end,
    staleTime: 30_000,
  });
}

export function useRestockAlerts(): UseQueryResult<RestockAlertsResponse, Error> {
  return useQuery({
    queryKey: merchantKeys.restock(),
    queryFn: () => api<RestockAlertsResponse>("/merchant/restock-alerts"),
    staleTime: 60_000,
  });
}

/** GET /merchant/reviews — recent reviews on this merchant's products. */
export function useMerchantReviews(limit = 6): UseQueryResult<MerchantReviews, Error> {
  return useQuery({
    queryKey: [...merchantKeys.all, "reviews", limit],
    queryFn: () => api<MerchantReviews>(`/merchant/reviews?limit=${limit}`),
    staleTime: 30_000,
  });
}

export function useMerchantProducts(
  status?: ProductStatus,
): UseQueryResult<PaginatedProducts, Error> {
  const qs = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: merchantKeys.products(status),
    queryFn: () => api<PaginatedProducts>(`/merchant/products${qs}`),
    staleTime: 15_000,
  });
}

export function useMerchantOrders(
  status?: OrderStatus,
): UseQueryResult<PaginatedOrders, Error> {
  const qs = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: merchantKeys.orders(status),
    queryFn: () => api<PaginatedOrders>(`/merchant/orders${qs}`),
    staleTime: 10_000,
  });
}

interface ProductPatch {
  title?: string;
  description?: string;
  price?: number;
  stock_qty?: number;
  status?: ProductStatus;
}

/** PATCH /products/:id — used for inline quick-edit and activate/archive. */
export function useUpdateProduct(): UseMutationResult<
  Product,
  Error,
  { id: string; patch: ProductPatch }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) =>
      api<Product>(`/products/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: merchantKeys.all });
    },
  });
}

/** PATCH /orders/:id/status — order manager status transitions. */
export function useUpdateOrderStatus(): UseMutationResult<
  Order,
  Error,
  { id: string; status: OrderStatus }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) =>
      api<Order>(`/orders/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: merchantKeys.all });
    },
  });
}

/** POST /merchant/generate-description — AI product copy generator. */
export function useGenerateDescription(): UseMutationResult<
  DescriptionResponse,
  Error,
  DescriptionRequest
> {
  return useMutation({
    mutationFn: (body) =>
      api<DescriptionResponse>("/merchant/generate-description", {
        method: "POST",
        body,
      }),
  });
}

/** POST /merchant/copilot — single-turn NL analytics. */
export function useCopilot(): UseMutationResult<CopilotResponse, Error, string> {
  return useMutation({
    mutationFn: (question) =>
      api<CopilotResponse>("/merchant/copilot", {
        method: "POST",
        body: { question },
      }),
  });
}

/** POST /merchant/weekly-narrative — AI week-in-review. refresh bypasses the 24h cache. */
export function useWeeklyNarrative(): UseMutationResult<
  WeeklyNarrative,
  Error,
  { refresh?: boolean } | void
> {
  return useMutation({
    mutationFn: (vars) =>
      api<WeeklyNarrative>(
        `/merchant/weekly-narrative${vars && vars.refresh ? "?refresh=true" : ""}`,
        { method: "POST" },
      ),
  });
}

/** GET /merchant/products/:id/forecast — Prophet demand forecast. */
export function useProductForecast(
  productId: string | null,
  horizon = 30,
): UseQueryResult<ProductForecast, Error> {
  return useQuery({
    queryKey: [...merchantKeys.all, "forecast", productId, horizon],
    queryFn: () =>
      api<ProductForecast>(
        `/merchant/products/${productId}/forecast?horizon=${horizon}`,
      ),
    enabled: !!productId,
    staleTime: 60_000,
  });
}
