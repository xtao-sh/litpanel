"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, RotateCcw, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage, type Message } from "@/components/ask/chat-message";
import type { ResearchLandscape } from "@/lib/types";
import { activeLibraryFetch, getApiUrl, withActiveLibraryHeaders } from "@/lib/api";
import { useI18n } from "@/lib/i18n/locale-context";

const API_URL = getApiUrl();

// ---------------------------------------------------------------------------
// Landscape summary generator (compressed for context window)
// ---------------------------------------------------------------------------

function buildLandscapeSummary(
  landscape: ResearchLandscape | null,
  totalPapers: number
): string {
  if (!landscape) return `${totalPapers} papers found.`;

  const parts: string[] = [`${totalPapers} papers.`];

  if (landscape.methods.length > 0) {
    const top = landscape.methods
      .sort((a, b) => b.paperCount - a.paperCount)
      .slice(0, 5)
      .map((m) => `${m.title} (${m.paperCount})`)
      .join(", ");
    parts.push(`Methods: ${top}.`);
  }

  if (landscape.datasets.length > 0) {
    const top = landscape.datasets
      .sort((a, b) => b.paperCount - a.paperCount)
      .slice(0, 3)
      .map((d) => `${d.title} (${d.paperCount})`)
      .join(", ");
    parts.push(`Datasets: ${top}.`);
  }

  const gapCount =
    landscape.gaps.unusedMethods.length +
    landscape.gaps.unusedDatasets.length +
    landscape.gaps.openQuestions.length;
  if (gapCount > 0) {
    parts.push(`Gaps: ${gapCount} identified.`);
    if (landscape.gaps.unusedMethods.length > 0) {
      parts.push(
        `Unused methods: ${landscape.gaps.unusedMethods
          .slice(0, 3)
          .map((m) => m.title)
          .join(", ")}.`
      );
    }
  }

  // Truncate to ~500 chars
  const result = parts.join(" ");
  return result.length > 500 ? result.slice(0, 497) + "..." : result;
}

// ---------------------------------------------------------------------------
// Suggested questions generator
// ---------------------------------------------------------------------------

function buildSuggestedQuestions(
  searchQuery: string,
  landscape: ResearchLandscape | null
): string[] {
  const questions: string[] = [];

  if (searchQuery.toLowerCase().includes("china")) {
    questions.push("What data would I need to study this in China?");
  }

  if (landscape?.methods?.[0]) {
    questions.push(
      `What are the limitations of ${landscape.methods[0].title} for this question?`
    );
  }

  questions.push("What aspects of this topic haven't been studied yet?");
  questions.push("Who are the key researchers in this area?");
  questions.push("What's the most promising research direction?");

  return questions.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResearchChatProps {
  open: boolean;
  onToggle: () => void;
  allPaperIds: string[];
  searchQuery: string;
  landscape: ResearchLandscape | null;
  totalPapers: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResearchChat({
  open,
  onToggle,
  allPaperIds,
  searchQuery,
  landscape,
  totalPapers,
}: ResearchChatProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const storageKey = `research_chat_${searchQuery}`;
  const suggestedQuestions = buildSuggestedQuestions(searchQuery, landscape);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.messages?.length && Date.now() - saved.timestamp < 24 * 60 * 60 * 1000) {
          setMessages(saved.messages);
          setSessionId(saved.sessionId);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [storageKey]);

  // Persist session to localStorage on every message change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify({
        messages,
        sessionId,
        timestamp: Date.now(),
      }));
    }
  }, [messages, sessionId, storageKey]);

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
    localStorage.removeItem(storageKey);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [storageKey]);

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
        const landscapeSummary = buildLandscapeSummary(landscape, totalPapers);

        const body: Record<string, unknown> = {
          question: question.trim(),
          paper_ids: allPaperIds.slice(0, 200),
          search_query: searchQuery,
          landscape_summary: landscapeSummary,
        };
        if (sessionId) {
          body.session_id = sessionId;
        }

        const response = await activeLibraryFetch(`${API_URL}/api/ask/contextual`, {
          method: "POST",
          headers: withActiveLibraryHeaders({ "Content-Type": "application/json" }),
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
    [isStreaming, sessionId, allPaperIds, searchQuery, landscape, totalPapers]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitQuestion(input);
    },
    [input, submitQuestion]
  );

  // Toggle button (always visible)
  if (!open) {
    return (
      <Button
        variant="default"
        size="sm"
        className="fixed bottom-6 right-6 z-30 gap-2 rounded-full px-4 py-2 shadow-[var(--shadow-2)] lg:static lg:shadow-none"
        onClick={onToggle}
      >
        <Sparkles className="h-4 w-4" />
        {t("research.chat.open")}
      </Button>
    );
  }

  return (
    <div className="lp-card flex h-full w-full flex-col rounded-[var(--r-md)] bg-[var(--paper)]/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <p className="section-kicker">{t("research.chat.kicker")}</p>
            <div className="mt-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--forest)]" />
              <h3 className="font-display text-[1.35rem] text-[var(--ink)]">{t("research.chat.title")}</h3>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 rounded-full px-3 text-xs"
              onClick={handleNewConversation}
            >
              <RotateCcw className="h-3 w-3" />
              {t("research.chat.new")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={onToggle}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Context banner */}
      {searchQuery && (
        <div className="flex items-center gap-2 border-b border-[var(--line-soft)]/50 bg-[var(--paper-2)] px-4 py-2">
          <MessageSquare className="h-3 w-3 shrink-0 text-[var(--forest)]" />
          <p className="truncate text-xs text-[var(--ink-4)]">
            {t("research.chat.context", { count: totalPapers.toLocaleString(), query: searchQuery })}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2">
            <div className="lp-card mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--r-md)]">
              <Sparkles className="h-5 w-5 text-[var(--forest)]" />
            </div>
            <p className="mb-4 text-center text-xs text-[var(--ink-4)]">
              {t("research.chat.empty")}
            </p>
            {/* Suggested questions */}
            <div className="w-full space-y-1.5">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="lp-card w-full rounded-[var(--r-md)] px-3 py-2 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
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
      <div className="shrink-0 border-t border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="lp-card flex flex-1 rounded-[var(--r-md)] p-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("research.chat.placeholder")}
              disabled={isStreaming}
              className="flex h-9 flex-1 rounded-[0.8rem] border border-[var(--line)] bg-[var(--paper)]/75 px-3 text-sm placeholder:text-[var(--ink-4)] focus-visible:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
