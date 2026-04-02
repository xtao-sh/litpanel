"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, RotateCcw, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage, type Message } from "@/components/ask/chat-message";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Suggested questions for a single paper
// ---------------------------------------------------------------------------

const PAPER_QUESTIONS = [
  "What is the main identification strategy?",
  "What are the key limitations?",
  "How applicable is this to China?",
  "What data would I need to replicate this?",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PaperChatProps {
  paperId: string;
  paperTitle: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaperChat({ paperId, paperTitle }: PaperChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevPaperIdRef = useRef(paperId);

  // Reset session when paper changes
  useEffect(() => {
    if (prevPaperIdRef.current !== paperId) {
      setMessages([]);
      setSessionId(null);
      setInput("");
      setIsStreaming(false);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      prevPaperIdRef.current = paperId;
    }
  }, [paperId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setInput("");
    setIsStreaming(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const submitQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return;

      const userMessage: Message = { role: "user", content: question.trim() };
      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        context: [],
        citations: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, unknown> = {
          question: question.trim(),
          paper_ids: [paperId],
          search_query: paperTitle,
          landscape_summary: "",
        };
        if (sessionId) {
          body.session_id = sessionId;
        }

        const response = await fetch(`${API_URL}/api/ask/contextual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Server responded with ${response.status}: ${response.statusText}`
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            let data: {
              type: string;
              session_id?: string;
              items?: { entity_type: string; entity_id: string; title: string }[];
              text?: string;
              citations?: string[];
              message?: string;
            };
            try {
              data = JSON.parse(trimmed.slice(6));
            } catch {
              continue;
            }

            if (data.type === "session" && data.session_id) {
              setSessionId(data.session_id);
            } else if (data.type === "context" && data.items) {
              const contextItems = data.items.map((item) => ({
                entityType: item.entity_type,
                entityId: item.entity_id,
                title: item.title,
              }));
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, context: contextItems };
                }
                return updated;
              });
            } else if (data.type === "chunk" && data.text) {
              const chunk = data.text;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + chunk,
                  };
                }
                return updated;
              });
            } else if (data.type === "done") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    citations: data.citations ?? [],
                    isStreaming: false,
                  };
                }
                return updated;
              });
            } else if (data.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: data.message ?? "An unexpected error occurred.",
                    isStreaming: false,
                    error: true,
                  };
                }
                return updated;
              });
            }
          }
        }

        // Stream ended without done event
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, isStreaming: false };
          }
          return updated;
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, isStreaming: false };
            }
            return updated;
          });
        } else {
          const errorMessage =
            err instanceof TypeError &&
            (err.message.includes("fetch") || err.message.includes("network"))
              ? "Could not reach the backend. Make sure the API server is running."
              : err instanceof Error
                ? err.message
                : "An unexpected error occurred.";

          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: errorMessage,
                isStreaming: false,
                error: true,
              };
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, sessionId, paperId, paperTitle]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitQuestion(input);
    },
    [input, submitQuestion]
  );

  // -----------------------------------------------------------------------
  // Floating button (always rendered)
  // -----------------------------------------------------------------------
  if (!open) {
    return (
      <Button
        variant="default"
        size="sm"
        className="fixed bottom-6 right-6 z-40 gap-2 rounded-full px-4 py-2.5 shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        Ask about this paper
      </Button>
    );
  }

  // -----------------------------------------------------------------------
  // Chat panel
  // -----------------------------------------------------------------------
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] lg:hidden"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-50 flex h-[70vh] w-full flex-col border-l border-t border-border bg-background/95 shadow-2xl backdrop-blur-md lg:bottom-6 lg:right-6 lg:h-[600px] lg:w-[400px] lg:rounded-xl lg:border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:rounded-t-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Paper Assistant</h3>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleNewConversation}
              >
                <RotateCcw className="h-3 w-3" />
                New
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Context banner */}
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/30 px-4 py-2">
          <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
          <p className="truncate text-xs text-muted-foreground">
            {paperId} &mdash; {paperTitle}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-2">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <Sparkles className="h-5 w-5 text-blue-500" />
              </div>
              <p className="mb-4 text-center text-xs text-muted-foreground">
                Ask questions about this paper. The AI has read the full analysis.
              </p>
              {/* Suggested questions */}
              <div className="w-full space-y-1.5">
                {PAPER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-blue-50/50"
                    onClick={() => submitQuestion(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, idx) => (
                <ChatMessage key={idx} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-background px-3 py-2 lg:rounded-b-xl">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this paper..."
              disabled={isStreaming}
              className="flex h-9 flex-1 rounded-lg border border-input bg-muted/30 px-3 text-sm placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming}
              className="h-9 w-9 shrink-0 rounded-lg"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
