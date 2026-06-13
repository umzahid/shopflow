"use client";

import { create } from "zustand";

import type { User } from "@/types/api";

interface AuthState {
  /** Short-lived access token (15min). Kept in memory only — never localStorage. */
  accessToken: string | null;
  /** Currently signed-in user, or null. */
  user: User | null;
  /** True once we've at least attempted a silent refresh on app boot. */
  bootChecked: boolean;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  setBootChecked: () => void;
}

// The refresh token lives in an httpOnly cookie scoped to /api/v1/auth.
// Browsers handle it automatically via `credentials: "include"` in fetch.
// We deliberately do NOT persist the access token: stealing localStorage
// would be a full session takeover. Memory-only + silent-refresh-on-boot
// gives us "remember me" UX without the XSS risk.
export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootChecked: false,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clearAuth: () => set({ accessToken: null, user: null }),
  setBootChecked: () => set({ bootChecked: true }),
}));

export function isAuthenticated(): boolean {
  return useAuth.getState().accessToken !== null;
}
