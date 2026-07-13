import { beforeEach, describe, expect, it, vi } from "vitest";

// streamSSE reads the token from the auth store; stub it so no real state is needed.
vi.mock("@/store/auth", () => ({
  useAuth: {
    getState: () => ({ accessToken: "tok", setAuth: vi.fn(), clearAuth: vi.fn() }),
  },
}));

import { streamCopilot } from "./merchant";

/** A Response whose body streams the given SSE frames, then closes. */
function sseResponse(frames: string[], init?: ResponseInit): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

describe("streamCopilot (real streamSSE path)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects with the server's detail when a backend error event arrives", async () => {
    // Regression guard: streamSSE must NOT swallow the Error thrown on an
    // `error` event (it previously did, via the malformed-frame catch).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"delta","text":"partial "}\n\n',
          'data: {"type":"error","detail":"The assistant is rate-limited; please retry shortly."}\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    await expect(streamCopilot("q", (t) => deltas.push(t))).rejects.toThrow(
      "rate-limited",
    );
    expect(deltas).toEqual(["partial "]); // deltas before the error still delivered
  });

  it("resolves with the tools used on a clean stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"tool","tool":"get_order_stats"}\n\n',
          'data: {"type":"delta","text":"All done."}\n\n',
          'data: {"type":"done","tool_calls":["get_order_stats"]}\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    const tools = await streamCopilot("q", (t) => deltas.push(t));
    expect(deltas).toEqual(["All done."]);
    expect(tools).toEqual(["get_order_stats"]);
  });

  it("skips malformed frames without aborting the stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          "data: not-json\n\n",
          'data: {"type":"delta","text":"ok"}\n\n',
          'data: {"type":"done","tool_calls":[]}\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    const tools = await streamCopilot("q", (t) => deltas.push(t));
    expect(deltas).toEqual(["ok"]);
    expect(tools).toEqual([]);
  });
});
