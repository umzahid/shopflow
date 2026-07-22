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

async function execRequest(
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
  let res = await execRequest(url, opts, initialToken);

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
      res = await execRequest(url, opts, refreshed.access_token);
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

/**
 * POST a body and consume a Server-Sent Events response, invoking `onEvent` for
 * each `data:` JSON payload. Mirrors `api()`'s auth + one-shot 401 refresh, but
 * streams the body instead of buffering. Resolves when the stream ends.
 */
export async function streamSSE(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const url = `${API_BASE}${path}`;

  const open = (token: string | null): Promise<Response> =>
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  let res = await open(useAuth.getState().accessToken);
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      res = await open(refreshed.access_token);
    } else {
      useAuth.getState().clearAuth();
    }
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    // The error body may not be JSON (e.g. an HTML 502 from a proxy) — don't
    // let a parse failure mask the real status.
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (data && typeof data === "object" && "title" in data && "status" in data) {
      throw new ApiError(data as ProblemDetail);
    }
    throw new ApiError({
      type: "about:blank",
      title: "Error",
      status: res.status,
      detail: res.statusText || "Streaming request failed",
      instance: path,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // SSE frames are separated by a blank line; a frame may span reads, so buffer.
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        // Parse and dispatch are separate: a malformed frame is skipped, but an
        // error thrown by onEvent (e.g. a backend `error` event) must propagate.
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue; // ignore malformed frame
        }
        onEvent(payload);
      }
    }
  } finally {
    // Release the connection on any exit, including an onEvent throw.
    reader.cancel().catch(() => {});
  }
}
