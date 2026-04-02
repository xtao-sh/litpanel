"use client";

import React, { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Sparkles, RotateCcw, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage, type Message } from "@/components/ask/chat-message";
import type { ContextItem } from "@/components/ask/context-panel";
import { ExampleQuestions } from "@/components/ask/example-questions";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AskPage() {
  return (
    <Suspense>
      <AskPageInner />
    </Suspense>
  );
}

function AskPageInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    inputRef.current?.focus();
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
        const body: Record<string, unknown> = {
          question: question.trim(),
          max_context: 20,
        };
        if (sessionId) {
          body.session_id = sessionId;
        }

        const response = await fetch(`${API_URL}/api/ask`, {
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
    [isStreaming, sessionId]
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
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="shrink-0 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Ask the Knowledge Base
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Session indicator */}
            {sessionId && turnCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-blue-600">
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
                className="gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Chat
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Ask questions about your research and get AI-generated answers with
          citations from NBER working papers.
          {sessionId && turnCount > 0 && (
            <span className="ml-1 text-blue-500">
              The AI remembers this conversation.
            </span>
          )}
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto rounded-lg">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <Sparkles className="h-7 w-7 text-blue-500" />
            </div>
            <p className="mb-6 text-center text-sm text-gray-500">
              Ask a question to get started. The AI will search the knowledge
              base and provide an answer with citations.
            </p>
            <div className="w-full max-w-md">
              <ExampleQuestions onSelect={handleExampleSelect} />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {messages.map((msg, idx) => {
              // Find the preceding user question for assistant messages
              let userQuestion: string | undefined;
              if (msg.role === "assistant") {
                for (let i = idx - 1; i >= 0; i--) {
                  if (messages[i].role === "user") {
                    userQuestion = messages[i].content;
                    break;
                  }
                }
              }
              return (
                <ChatMessage key={idx} message={msg} userQuestion={userQuestion} />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-200 bg-white pt-4 pb-2">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your research knowledge..."
            disabled={isStreaming}
            className="flex h-12 flex-1 rounded-xl border border-gray-200 bg-gray-50/50 px-5 py-3 text-sm shadow-sm ring-offset-white placeholder:text-gray-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
            className="h-12 w-12 shrink-0 rounded-xl shadow-sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
