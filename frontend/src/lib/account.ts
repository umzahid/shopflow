import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { Address, AddressInput, MyReview, ProductSummary, User } from "@/types/api";

export const accountKeys = {
  all: ["account"] as const,
  addresses: () => [...accountKeys.all, "addresses"] as const,
  reviews: () => [...accountKeys.all, "reviews"] as const,
};

interface ProfilePatch {
  email?: string;
  current_password?: string;
  new_password?: string;
}

export function useUpdateProfile(): UseMutationResult<User, Error, ProfilePatch> {
  const setAuth = useAuth((s) => s.setAuth);
  const token = useAuth((s) => s.accessToken);
  return useMutation({
    mutationFn: (patch) => api<User>("/users/me", { method: "PATCH", body: patch }),
    onSuccess: (user) => {
      // Keep the in-memory user fresh (email may have changed).
      if (token) setAuth(token, user);
    },
  });
}

export function useAddresses(): UseQueryResult<Address[], Error> {
  return useQuery({
    queryKey: accountKeys.addresses(),
    queryFn: () => api<Address[]>("/users/me/addresses"),
    staleTime: 30_000,
  });
}

export function useCreateAddress(): UseMutationResult<Address, Error, AddressInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api<Address>("/users/me/addresses", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.addresses() }),
  });
}

export function useUpdateAddress(): UseMutationResult<
  Address,
  Error,
  { id: string; patch: Partial<AddressInput> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) =>
      api<Address>(`/users/me/addresses/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.addresses() }),
  });
}

export function useDeleteAddress(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api<void>(`/users/me/addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.addresses() }),
  });
}

export function useMyReviews(): UseQueryResult<MyReview[], Error> {
  return useQuery({
    queryKey: accountKeys.reviews(),
    queryFn: () => api<MyReview[]>("/users/me/reviews"),
    staleTime: 30_000,
  });
}

export function useDeleteReview(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api<void>(`/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.reviews() }),
  });
}

export function useProductSummary(productId: string): UseQueryResult<ProductSummary, Error> {
  return useQuery({
    queryKey: ["product-summary", productId],
    queryFn: () => api<ProductSummary>(`/products/${productId}/summary`),
    enabled: !!productId,
    staleTime: 300_000,
  });
}
