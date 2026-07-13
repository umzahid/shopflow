"use client";

import { Bot, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { streamCopilot } from "@/lib/merchant";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const STORAGE_KEY = "shopflow.copilot.history";

const SUGGESTIONS = [
  "What was my revenue in the last 30 days?",
  "Which products are my top sellers?",
  "How many orders are pending review?",
];

/** Very small markdown: **bold**, `- ` bullets, and paragraph breaks. */
function renderMarkdown(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    const bolded = line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={j}>{seg.slice(2, -2)}</strong>
      ) : (
        <span key={j}>{seg}</span>
      ),
    );
    if (trimmed.startsWith("- ")) {
      return (
        <li key={i} className="ml-4 list-disc">
          {line.replace(/^\s*-\s/, "")}
        </li>
      );
    }
    return (
      <p key={i} className={trimmed ? "" : "h-2"}>
        {bolded}
      </p>
    );
  });
}

export function MerchantCopilot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore conversation across page navigation (sessionStorage per PRD).
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        /* ignore corrupt history */
      }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // Append streamed text to the trailing assistant message (the placeholder
  // pushed when the turn starts is always last while streaming).
  const appendToLast = (text: string) =>
    setMessages((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, content: last.content + text };
      return next;
    });

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || streaming) return;
    setMessages((m) => [
      ...m,
      { role: "user", content: q },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);
    try {
      const tools = await streamCopilot(q, appendToLast);
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          content: last.content || "(no answer)",
          tools,
        };
        return next;
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "something went wrong";
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        // Only overwrite if nothing streamed; otherwise keep the partial answer.
        if (!last.content) next[next.length - 1] = { ...last, content: `Sorry — ${detail}` };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Copilot" : "Open Merchant Copilot"}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-token-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Merchant Copilot"
          className="fixed bottom-24 right-6 z-40 flex h-[32rem] w-[calc(100vw-3rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-token-xl"
        >
          <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <Bot className="h-5 w-5 text-secondary" aria-hidden="true" />
            <div>
              <p className="font-heading text-sm font-bold text-foreground">Merchant Copilot</p>
              <p className="text-xs text-muted-foreground">Ask about your store — read-only.</p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  I can answer questions about your revenue, products, orders, and reviews.
                </p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-left text-foreground transition-colors hover:border-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    m.role === "user"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <div className="space-y-1 [&_strong]:font-semibold">
                    {m.content ? (
                      renderMarkdown(m.content)
                    ) : (
                      <span className="animate-pulse text-muted-foreground">Thinking…</span>
                    )}
                  </div>
                  {m.tools && m.tools.length > 0 && (
                    <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      via {m.tools.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Ask the Copilot"
              className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20"
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={streaming}
              aria-label="Send"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
