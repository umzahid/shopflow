import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { middleware } from "./middleware";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

function lastLog(): Record<string, unknown> {
  const line = logSpy.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(line);
}

afterEach(() => logSpy.mockClear());

describe("request-logging middleware (PRD §3.4)", () => {
  it("emits one JSON line with the six required fields", () => {
    middleware(new NextRequest("http://localhost:3000/products"));
    const log = lastLog();
    expect(log).toMatchObject({
      level: "INFO",
      service: "shopflow-frontend",
      message: "GET /products",
    });
    expect(typeof log.timestamp).toBe("string");
    expect(typeof log.traceId).toBe("string");
    expect((log.traceId as string).length).toBeGreaterThan(0);
    expect(typeof log.durationMs).toBe("number");
  });

  it("reuses an incoming x-request-id as the traceId (backend correlation)", () => {
    middleware(
      new NextRequest("http://localhost:3000/cart", {
        headers: { "x-request-id": "trace-abc-123" },
      }),
    );
    expect(lastLog().traceId).toBe("trace-abc-123");
  });

  it("echoes the traceId on the response header", () => {
    const res = middleware(new NextRequest("http://localhost:3000/"));
    const echoed = res.headers.get("x-request-id");
    expect(echoed).toBe(lastLog().traceId);
  });
});
