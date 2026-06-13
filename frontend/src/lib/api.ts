import type { ProblemDetail } from "@/types/api";

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

let _accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  _accessToken = token;
};

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(opts.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (_accessToken) headers.set("Authorization", `Bearer ${_accessToken}`);

  const res = await fetch(url, {
    ...opts,
    headers,
    credentials: "include", // sends refresh cookie on /auth/refresh
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    // Backend returns RFC 7807. Some FastAPI defaults still return {detail: "..."}
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
