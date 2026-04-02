"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  X,
  ThumbsUp,
  ShieldAlert,
  FlaskConical,
  Scale,
  Copy,
  Check,
  Loader2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ideas/score-bar";
import type { AgentRole, DebateAgentMessage, DebateVerdict } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AGENT_CONFIG: Record<
  AgentRole,
  { color: string; borderColor: string; bgColor: string; icon: React.ElementType; badgeClass: string }
> = {
  advocate: {
    color: "text-green-600",
    borderColor: "border-l-green-600",
    bgColor: "bg-green-600",
    icon: ThumbsUp,
    badgeClass: "bg-green-100 text-green-700 border-green-200",
  },
  skeptic: {
    color: "text-red-600",
    borderColor: "border-l-red-600",
    bgColor: "bg-red-600",
    icon: ShieldAlert,
    badgeClass: "bg-red-100 text-red-700 border-red-200",
  },
  methodologist: {
    color: "text-blue-600",
    borderColor: "border-l-blue-600",
    bgColor: "bg-blue-600",
    icon: FlaskConical,
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
  },
  moderator: {
    color: "text-purple-600",
    borderColor: "border-l-purple-600",
    bgColor: "bg-purple-600",
    icon: Scale,
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
  },
};

const PAPER_ID_RE = /\b(w\d{4,5})\b/g;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DebateModalProps {
  open: boolean;
  onClose: () => void;
  ideaTitle: string;
  ideaText: string;
  paperIds?: string[];
}

// ---------------------------------------------------------------------------
// Inline text with paper ID links
// ---------------------------------------------------------------------------

function renderInlineText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PAPER_ID_RE.lastIndex = 0;
  while ((match = PAPER_ID_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <Link
        key={`p-${match.index}`}
        href={`/paper/${match[1]}`}
        className="inline rounded bg-blue-50 px-1 py-0.5 font-mono text-xs font-semibold text-blue-600 hover:bg-blue-100"
      >
        {match[1]}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mt-4 mb-1.5 text-sm font-bold text-gray-900">
          {renderInlineText(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mt-3 mb-1 text-sm font-semibold text-gray-800">
          {renderInlineText(line.slice(4))}
        </h4>
      );
    } else if (/^[-*]\s/.test(line)) {
      elements.push(
        <li key={i} className="ml-4 text-sm text-gray-700 leading-relaxed list-disc">
          {renderInlineText(line.replace(/^[-*]\s+/, ""))}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <li key={i} className="ml-4 text-sm text-gray-700 leading-relaxed list-decimal">
          {renderInlineText(line.replace(/^\d+\.\s+/, ""))}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-gray-700 leading-relaxed">
          {renderInlineText(line)}
        </p>
      );
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Agent message card
// ---------------------------------------------------------------------------

function AgentMessageCard({
  message,
}: {
  message: DebateAgentMessage;
}) {
  const cfg = AGENT_CONFIG[message.role];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border-l-[3px] ${cfg.borderColor} bg-white p-4 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bgColor}`}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-900">{message.label}</span>
        <Badge variant="outline" className={`text-[10px] ${cfg.badgeClass}`}>
          {message.role}
        </Badge>
        {message.round > 0 && (
          <span className="text-[10px] text-gray-400">Round {message.round}</span>
        )}
      </div>
      <div className="pl-10">
        {renderMarkdown(message.text)}
        {message.isStreaming && (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-gray-400 align-middle" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict card
// ---------------------------------------------------------------------------

function VerdictCard({
  verdict,
  onCopy,
}: {
  verdict: DebateVerdict;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const recColor =
    verdict.recommendation === "pursue"
      ? "border-green-400 bg-green-50"
      : verdict.recommendation === "modify"
        ? "border-yellow-400 bg-yellow-50"
        : "border-red-400 bg-red-50";

  const recBadgeClass =
    verdict.recommendation === "pursue"
      ? "bg-green-500 text-white"
      : verdict.recommendation === "modify"
        ? "bg-yellow-500 text-white"
        : "bg-red-500 text-white";

  function handleCopy() {
    const text = [
      `Recommendation: ${verdict.recommendation.toUpperCase()}`,
      `Summary: ${verdict.summary}`,
      `Scores: Overall ${verdict.overallStrength}/5, Novelty ${verdict.novelty}/5, Feasibility ${verdict.feasibility}/5`,
      `Next Steps:`,
      ...verdict.nextSteps.map((s, i) => `  ${i + 1}. ${s}`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy();
  }

  return (
    <div className={`rounded-lg border-2 ${recColor} p-5 shadow-md`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-5 w-5 text-purple-600" />
          <span className="text-base font-bold text-gray-900">Verdict</span>
          <Badge className={`text-xs uppercase ${recBadgeClass}`}>
            {verdict.recommendation}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" /> Copy Verdict
            </>
          )}
        </Button>
      </div>

      <p className="mb-4 text-sm text-gray-700">{verdict.summary}</p>

      <div className="mb-4 space-y-1.5">
        <ScoreBar label="Overall" value={verdict.overallStrength} />
        <ScoreBar label="Novelty" value={verdict.novelty} />
        <ScoreBar label="Feasibility" value={verdict.feasibility} />
      </div>

      {verdict.nextSteps.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Next Steps
          </p>
          <ol className="space-y-1">
            {verdict.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round divider
// ---------------------------------------------------------------------------

function RoundDivider({ round }: { round: number }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        Round {round}
      </span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debate Modal
// ---------------------------------------------------------------------------

export function DebateModal({
  open,
  onClose,
  ideaTitle,
  ideaText,
  paperIds,
}: DebateModalProps) {
  const [status, setStatus] = useState<"idle" | "debating" | "done" | "error">("idle");
  const [messages, setMessages] = useState<DebateAgentMessage[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [rounds, setRounds] = useState<number[]>([]);
  const [synthesis, setSynthesis] = useState("");
  const [verdict, setVerdict] = useState<DebateVerdict | null>(null);
  const [contextItems, setContextItems] = useState<
    { entity_type: string; entity_id: string; title: string }[]
  >([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSynthesisDivider, setShowSynthesisDivider] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRoleRef = useRef<AgentRole | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, synthesis, verdict, rounds, showSynthesisDivider]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setMessages([]);
      setCurrentRound(0);
      setRounds([]);
      setSynthesis("");
      setVerdict(null);
      setContextItems([]);
      setErrorMessage("");
      setShowSynthesisDivider(false);
      activeRoleRef.current = null;
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const startDebate = useCallback(async () => {
    setStatus("debating");
    setMessages([]);
    setRounds([]);
    setSynthesis("");
    setVerdict(null);
    setContextItems([]);
    setErrorMessage("");
    setShowSynthesisDivider(false);
    activeRoleRef.current = null;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/api/debate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_title: ideaTitle,
          idea_text: ideaText,
          paper_ids: paperIds ?? [],
          rounds: 2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
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

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          const eventType = data.type as string;

          if (eventType === "context") {
            setContextItems(
              data.items as { entity_type: string; entity_id: string; title: string }[]
            );
          } else if (eventType === "round_start") {
            const round = data.round as number;
            setCurrentRound(round);
            setRounds((prev) => [...prev, round]);
          } else if (eventType === "agent_start") {
            const role = data.role as AgentRole;
            const label = data.label as string;
            const round = data.round as number;
            activeRoleRef.current = role;

            if (role === "moderator") {
              setShowSynthesisDivider(true);
            }

            setMessages((prev) => [
              ...prev,
              { role, label, round, text: "", isStreaming: true },
            ]);
          } else if (eventType === "chunk") {
            const text = data.text as string;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  text: last.text + text,
                };
              }
              return updated;
            });
          } else if (eventType === "agent_done") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.isStreaming) {
                updated[updated.length - 1] = { ...last, isStreaming: false };
              }
              return updated;
            });
            activeRoleRef.current = null;
          } else if (eventType === "synthesis_start") {
            setShowSynthesisDivider(true);
          } else if (eventType === "synthesis_done") {
            // handled by agent_done for moderator
          } else if (eventType === "verdict") {
            const d = data.data as Record<string, unknown>;
            setVerdict({
              overallStrength: (d.overall_strength as number) ?? 3,
              novelty: (d.novelty as number) ?? 3,
              feasibility: (d.feasibility as number) ?? 3,
              recommendation: (d.recommendation as "pursue" | "modify" | "abandon") ?? "modify",
              summary: (d.summary as string) ?? "",
              nextSteps: (d.next_steps as string[]) ?? [],
            });
          } else if (eventType === "done") {
            setStatus("done");
          } else if (eventType === "error") {
            setErrorMessage((data.message as string) ?? "An error occurred.");
            setStatus("error");
          }
        }
      }

      // In case stream finishes without explicit done
      setStatus((prev) => (prev === "debating" ? "done" : prev));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
      } else {
        const msg =
          err instanceof TypeError && err.message.includes("fetch")
            ? "Could not reach the backend. Make sure the API is running."
            : err instanceof Error
              ? err.message
              : "Debate failed.";
        setErrorMessage(msg);
        setStatus("error");
      }
    } finally {
      abortRef.current = null;
    }
  }, [ideaTitle, ideaText, paperIds]);

  const handleClose = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 flex h-[90vh] w-full max-w-[800px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-600 shrink-0" />
              <h2 className="truncate text-lg font-bold text-gray-900">
                {ideaTitle}
              </h2>
              <Badge className="shrink-0 bg-purple-100 text-purple-700 border-purple-200 text-[10px]">
                Research Debate
              </Badge>
            </div>
            {status === "debating" && currentRound > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Round {currentRound} in progress...
              </p>
            )}
            {status === "done" && (
              <p className="mt-1 text-xs text-green-600 font-medium">Debate complete</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-4 h-8 w-8 shrink-0 p-0"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {/* Idle state: start button */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-50">
                <Scale className="h-8 w-8 text-purple-500" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                Multi-Agent Research Debate
              </h3>
              <p className="mb-6 max-w-md text-center text-sm text-gray-500">
                Three AI agents will debate this research idea from different perspectives:
                an Advocate, a Skeptic, and a Methodologist. A Moderator will then
                synthesize the discussion and deliver a verdict.
              </p>
              <div className="mb-6 flex items-center gap-4">
                {(["advocate", "skeptic", "methodologist", "moderator"] as AgentRole[]).map(
                  (role) => {
                    const cfg = AGENT_CONFIG[role];
                    const Icon = cfg.icon;
                    return (
                      <div key={role} className="flex flex-col items-center gap-1">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${cfg.bgColor}`}
                        >
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-[10px] capitalize text-gray-500">{role}</span>
                      </div>
                    );
                  }
                )}
              </div>
              <Button onClick={startDebate} className="gap-2">
                <Scale className="h-4 w-4" />
                Start Debate
              </Button>
            </div>
          )}

          {/* Context banner */}
          {contextItems.length > 0 && status !== "idle" && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5">
              <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-xs text-blue-700">
                Analyzing with {contextItems.length} paper{contextItems.length !== 1 ? "s" : ""}
              </span>
              <div className="flex flex-wrap gap-1">
                {contextItems.slice(0, 8).map((item) => (
                  <Link
                    key={item.entity_id}
                    href={`/paper/${item.entity_id}`}
                    className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-600 hover:bg-blue-200"
                  >
                    {item.entity_id}
                  </Link>
                ))}
                {contextItems.length > 8 && (
                  <span className="text-[10px] text-blue-500">
                    +{contextItems.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Debate timeline */}
          {status !== "idle" && (
            <div className="space-y-3">
              {messages.map((msg, idx) => {
                const elements: React.ReactNode[] = [];

                // Insert round divider before first agent of each round
                const isFirstInRound =
                  idx === 0 ||
                  (msg.round > 0 && messages[idx - 1]?.round !== msg.round);
                if (isFirstInRound && msg.round > 0) {
                  elements.push(<RoundDivider key={`round-${msg.round}`} round={msg.round} />);
                }

                // Insert synthesis divider before moderator
                if (msg.role === "moderator" && showSynthesisDivider) {
                  const isFirstMod =
                    idx === 0 || messages[idx - 1]?.role !== "moderator";
                  if (isFirstMod) {
                    elements.push(
                      <div key="synthesis-divider" className="flex items-center gap-3 py-3">
                        <div className="h-px flex-1 bg-purple-200" />
                        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-600">
                          Moderator Synthesis
                        </span>
                        <div className="h-px flex-1 bg-purple-200" />
                      </div>
                    );
                  }
                }

                elements.push(
                  <AgentMessageCard key={`msg-${idx}`} message={msg} />
                );

                return elements;
              })}

              {/* Verdict */}
              {verdict && (
                <div className="mt-4">
                  <VerdictCard verdict={verdict} onCopy={() => {}} />
                </div>
              )}

              {/* Error */}
              {status === "error" && errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-2">
            {status === "debating" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                <span className="text-xs text-gray-500">Debate in progress...</span>
              </>
            )}
            {status === "done" && (
              <span className="text-xs font-medium text-green-600">
                Debate complete
              </span>
            )}
            {status === "error" && (
              <span className="text-xs font-medium text-red-600">
                Debate failed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(status === "error" || status === "done") && (
              <Button variant="outline" size="sm" className="text-xs" onClick={startDebate}>
                Restart Debate
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
