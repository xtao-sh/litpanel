"use client";

import React, { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Sparkles, RotateCcw, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage, type Message } from "@/components/ask/chat-message";
import type { ContextItem } from "@/components/ask/context-panel";
import { ExampleQuestions } from "@/components/ask/example-questions";
import { appConfig } from "@/lib/app-config";
import { activeLibraryFetch, getApiUrl, withActiveLibraryHeaders } from "@/lib/api";

const API_URL = getApiUrl();

export default function AskPage() {
  return (
    <Suspense>
      <AskPageInner />
    </Suspense>
  );
}

function AskPageInner() {
  const searchParams = useSearchParams();
  const paperIdParam = searchParams.get("paperId");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialQueryHandled = useRef(false);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ask_session');
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
  }, []);

  // Persist session to localStorage on every message change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('ask_session', JSON.stringify({
        messages,
        sessionId,
        timestamp: Date.now(),
      }));
    }
  }, [messages, sessionId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Count the number of conversation turns (user messages)
  const turnCount = messages.filter((m) => m.role === "user").length;

  function handleNewConversation() {
    setMessages([]);
    setSessionId(null);
    setInput("");
    setIsStreaming(false);
    localStorage.removeItem('ask_session');
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    inputRef.current?.focus();
  }

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
        const body: Record<string, unknown> = paperIdParam
          ? { paper_id: paperIdParam, question: question.trim() }
          : { question: question.trim(), max_context: 20, ...(sessionId ? { session_id: sessionId } : {}) };

        const askEndpoint = paperIdParam ? `${API_URL}/api/ask/paper` : `${API_URL}/api/ask`;
        const response = await activeLibraryFetch(askEndpoint, {
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
        if (!reader) {
          throw new Error("No response body");
        }

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
              const contextItems: ContextItem[] = data.items.map((item) => ({
                entityType: item.entity_type,
                entityId: item.entity_id,
                title: item.title,
              }));
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    context: contextItems,
                  };
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
                    content:
                      data.message ?? "An unexpected error occurred.",
                    isStreaming: false,
                    error: true,
                  };
                }
                return updated;
              });
            }
          }
        }

        // Handle case where stream ends without a "done" event
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
          // User cancelled, mark streaming as done
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
              ? "Could not reach the backend. Make sure the API server is running at " +
                API_URL
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
    [isStreaming, sessionId, paperIdParam]
  );

  // Auto-fill (and optionally auto-submit) from URL param ?q=...
  useEffect(() => {
    if (initialQueryHandled.current) return;
    const qParam = searchParams.get("q");
    if (qParam && messages.length === 0) {
      initialQueryHandled.current = true;
      setInput(qParam);
      // Auto-submit the question from the URL
      submitQuestion(qParam);
    }
  }, [searchParams, messages.length, submitQuestion]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitQuestion(input);
  }

  function handleExampleSelect(question: string) {
    submitQuestion(question);
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      className={`mx-auto flex max-w-4xl flex-col pt-6 ${
        isEmpty ? "min-h-[calc(100vh-5rem)]" : "h-[calc(100vh-5rem)]"
      }`}
    >
      {/* Header */}
      <div className="shrink-0 pb-4">
        <div className="paper-panel rounded-[1.8rem] px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="paper-panel flex h-11 w-11 items-center justify-center rounded-[1rem]">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="section-kicker">Research assistant</p>
                <h1 className="font-display text-[2rem] text-foreground">
                  Ask the Knowledge Base
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Session indicator */}
              {sessionId && turnCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">
                    {turnCount} {turnCount === 1 ? "turn" : "turns"}
                  </span>
                </div>
              )}
              {/* New conversation button */}
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewConversation}
                  className="gap-1.5 rounded-full text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              )}
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Ask questions about your research and get AI-generated answers with
            citations from the papers in your {appConfig.corpusLabel}.
            {sessionId && turnCount > 0 && (
              <span className="ml-1 text-primary">
                The assistant is keeping the thread context.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Paper context banner */}
      {paperIdParam && (
        <div className="paper-panel mb-4 shrink-0 flex items-center gap-2 rounded-[1.15rem] px-4 py-2.5">
          <MessageCircle className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-foreground">
            Asking about paper <span className="font-mono font-semibold">{paperIdParam}</span>
          </span>
        </div>
      )}

      {/* Messages area */}
      <div
        className={`paper-panel overflow-y-auto rounded-[1.7rem] px-4 ${
          isEmpty ? "min-h-[26rem] py-6" : "flex-1"
        }`}
      >
        {isEmpty ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-4">
            <div className="paper-panel mb-5 flex h-14 w-14 items-center justify-center rounded-[1.15rem]">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <p className="mb-3 text-center text-sm font-medium text-foreground">
              Start with a question, then keep the thread open while you refine it.
            </p>
            <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
              Ask a question to get started. The AI will search the knowledge
              base and provide an answer with citations.
            </p>
            <div className="w-full max-w-md">
              <ExampleQuestions onSelect={handleExampleSelect} />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {(() => {
              let firstContextSeen = false;
              return messages.map((msg, idx) => {
                // Find the preceding user question for assistant messages
                let userQuestion: string | undefined;
                let isFirstContext = false;
                if (msg.role === "assistant") {
                  for (let i = idx - 1; i >= 0; i--) {
                    if (messages[i].role === "user") {
                      userQuestion = messages[i].content;
                      break;
                    }
                  }
                  if (msg.context && msg.context.length > 0 && !firstContextSeen) {
                    firstContextSeen = true;
                    isFirstContext = true;
                  }
                }
                return (
                  <ChatMessage
                    key={idx}
                    message={msg}
                    userQuestion={userQuestion}
                    defaultContextExpanded={isFirstContext}
                  />
                );
              });
            })()}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={`shrink-0 border-t border-border/70 bg-card/60 ${isEmpty ? "pt-3 pb-4" : "pt-4 pb-2"}`}>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="paper-panel flex flex-1 rounded-[1.15rem] p-1.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 4 * 24 + 24)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask a question about your research knowledge..."
              disabled={isStreaming}
              rows={1}
              className="flex min-h-[48px] max-h-[120px] flex-1 resize-none rounded-[0.95rem] border border-border bg-background/80 px-5 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {isStreaming ? (
            <button
              type="button"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
              }}
              className="shrink-0 rounded-full bg-red-600 px-3 py-2 text-white text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Stop
            </button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              className="h-12 w-12 shrink-0 rounded-full shadow-sm"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
