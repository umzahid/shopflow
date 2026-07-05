"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { Token } from "@/types/api";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  role?: "customer" | "merchant";
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<Token, Error, LoginInput>({
    mutationFn: (input) =>
      api<Token>("/auth/login", { method: "POST", body: input }),
    onSuccess: (data) => {
      useAuth.getState().setAuth(data.access_token, data.user);
      queryClient.invalidateQueries();
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation<Token, Error, RegisterInput>({
    mutationFn: (input) =>
      api<Token>("/auth/register", {
        method: "POST",
        body: { role: "customer", ...input },
      }),
    onSuccess: (data) => {
      useAuth.getState().setAuth(data.access_token, data.user);
      queryClient.invalidateQueries();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () =>
      api<void>("/auth/logout", { method: "DELETE", skipAuthRefresh: true }),
    onSuccess: () => {
      useAuth.getState().clearAuth();
      queryClient.clear();
    },
    onError: () => {
      // Even on network failure, drop local state — user clicked sign out.
      useAuth.getState().clearAuth();
      queryClient.clear();
    },
  });
}
