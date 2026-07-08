import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side structured request logging (PRD §3.4) — one JSON line per
 * request with the same schema and trace header the backend uses
 * (backend/app/core/logging.py), so a single traceId grep correlates both
 * services: an incoming `x-request-id` is reused, forwarded to the handler,
 * and echoed on the response.
 *
 * durationMs is the middleware span: Edge middleware returns a routing
 * directive before the render happens, so full render time isn't observable
 * here without a custom server. The backend logs authoritative request
 * durations under the same traceId.
 */
export function middleware(request: NextRequest) {
  const start = Date.now();
  const traceId =
    request.headers.get("x-request-id") ?? crypto.randomUUID().replace(/-/g, "");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", traceId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", traceId);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      service: "shopflow-frontend",
      traceId,
      message: `${request.method} ${request.nextUrl.pathname}`,
      durationMs: Date.now() - start,
      method: request.method,
      path: request.nextUrl.pathname,
    }),
  );

  return response;
}

// Skip static assets — logging them is pure noise (same spirit as the
// backend skipping /metrics scrapes).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
