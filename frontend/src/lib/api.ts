import { useAuth } from "@/store/auth";
import type { ProblemDetail, Token } from "@/types/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/** RFC 7807-shaped error. Throw from API calls so React Query catches it. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.problem = problem;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** When true, skip the 401-then-refresh dance (used by refresh itself). */
  skipAuthRefresh?: boolean;
}

// Single in-flight refresh promise — multiple parallel 401s coalesce into one
// call to /auth/refresh rather than racing each other and rotating tokens
// repeatedly.
let refreshInFlight: Promise<Token | null> | null = null;

async function refreshToken(): Promise<Token | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Token;
      useAuth.getState().setAuth(data.access_token, data.user);
      return data;
    } catch {
      return null;
    } finally {
      // clear so a subsequent 401 (much later) can refresh again
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

/** Attempt to restore a session from the httpOnly refresh cookie. */
export async function silentRefresh(): Promise<boolean> {
  const result = await refreshToken();
  return result !== null;
}

async function execRequest<T>(
  url: string,
  opts: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, {
    ...opts,
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export async function api<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const initialToken = useAuth.getState().accessToken;
  let res = await execRequest<T>(url, opts, initialToken);

  // Try-once refresh on 401 (skip when we're inside the refresh call itself
  // and skip on the auth endpoints to avoid login-form thrash).
  if (
    res.status === 401 &&
    !opts.skipAuthRefresh &&
    !path.startsWith("/auth/refresh") &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/register")
  ) {
    const refreshed = await refreshToken();
    if (refreshed) {
      res = await execRequest<T>(url, opts, refreshed.access_token);
    } else {
      // Refresh failed — clear stale token so UI flips to signed-out state.
      useAuth.getState().clearAuth();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    if (data && typeof data === "object" && "title" in data && "status" in data) {
      throw new ApiError(data as ProblemDetail);
    }
    throw new ApiError({
      type: "about:blank",
      title: "Error",
      status: res.status,
      detail: typeof data?.detail === "string" ? data.detail : res.statusText,
      instance: path,
    });
  }

  return data as T;
}
