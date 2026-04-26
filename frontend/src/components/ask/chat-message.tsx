"use client";

import React, { useState } from "react";
import Link from "next/link";
import { User, Bot, Microscope, GitBranch, Copy, Check } from "lucide-react";
import { buildPaperSetGraphHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { ContextPanel, type ContextItem } from "./context-panel";
import { CitationBadges } from "./citation-badges";

export interface Message {
  role: "user" | "assistant";
  content: string;
  context?: ContextItem[];
  citations?: string[];
  isStreaming?: boolean;
  error?: boolean;
}

/**
 * Lightweight inline-markdown renderer.
 *
 * Handles:
 *  - **bold**
 *  - Paper-id references like w31161 -> clickable link
 *  - Preserves numbered lists and bullet points via whitespace
 */
function renderContent(text: string) {
  // First split by lines to preserve structure
  const lines = text.split("\n");

  return lines.map((line, lineIdx) => {
    // Combine bold and paper-id into a single pass
    const COMBINED_RE = /(\*\*(.+?)\*\*)|(\b(w\d{4,6})\b)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = COMBINED_RE.exec(line)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      if (match[1]) {
        // Bold match
        parts.push(
          <strong key={`b-${lineIdx}-${match.index}`}>{match[2]}</strong>
        );
      } else if (match[3]) {
        // Paper ID match
        parts.push(
          <Link
            key={`p-${lineIdx}-${match.index}`}
            href={`/paper/${match[4]}`}
            className="inline-flex items-baseline rounded-full bg-primary/10 px-2 py-0.5 font-mono text-sm font-medium text-primary no-underline hover:bg-primary/15"
          >
            {match[4]}
          </Link>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Remaining text after last match
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    // Empty line = paragraph break
    if (line.trim() === "") {
      return <br key={`ln-${lineIdx}`} />;
    }

    return (
      <span key={`ln-${lineIdx}`}>
        {parts.length > 0 ? parts : line}
        {lineIdx < lines.length - 1 && "\n"}
      </span>
    );
  });
}

interface ChatMessageProps {
  message: Message;
  userQuestion?: string;
  defaultContextExpanded?: boolean;
}

export function ChatMessage({ message, userQuestion, defaultContextExpanded }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(message.content).catch(() => {
      // Clipboard access can be blocked in embedded browsers.
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-blue-100" : message.error ? "bg-red-100" : "bg-gray-100"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-blue-600" />
        ) : (
          <Bot
            className={cn(
              "h-4 w-4",
              message.error ? "text-red-600" : "text-gray-600"
            )}
          />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "relative group max-w-[85%] px-4 py-3 shadow-sm",
          isUser
            ? "rounded-[1.35rem] rounded-br-sm bg-foreground text-background"
            : message.error
              ? "rounded-[1.35rem] rounded-bl-sm border border-red-200 bg-red-50 text-red-800"
              : "paper-panel rounded-[1.35rem] rounded-bl-sm text-foreground"
        )}
      >
        {/* Copy button for assistant messages */}
        {!isUser && !message.isStreaming && message.content && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 rounded-full p-1 opacity-0 text-muted-foreground transition-all group-hover:opacity-100 hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
            title="Copy as text"
            aria-label="Copy message"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {/* Context panel for assistant messages */}
        {!isUser && message.context && message.context.length > 0 && (
          <ContextPanel items={message.context} defaultExpanded={defaultContextExpanded} />
        )}

        {/* Message text */}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {isUser ? message.content : renderContent(message.content)}
          {message.isStreaming && !message.content && (
            <div className="flex gap-1 py-2">
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '0ms'}} />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '150ms'}} />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '300ms'}} />
            </div>
          )}
          {message.isStreaming && message.content && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-sm bg-current opacity-70" />
          )}
        </div>

        {/* Citations */}
        {!isUser && !message.isStreaming && message.citations && message.citations.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2 mb-1">Sources referenced:</p>
            <CitationBadges citations={message.citations} />
          </>
        )}

        {/* Explore further actions */}
        {!isUser && !message.isStreaming && !message.error && message.citations && message.citations.length > 0 && userQuestion && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-border/70 pt-2">
            <Link
              href={`/research?q=${encodeURIComponent(userQuestion)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
            >
              <Microscope className="h-3 w-3" />
              Explore in Research Mode
            </Link>
            <Link
              href={buildPaperSetGraphHref({
                paperIds: message.citations,
                source: "ask",
                label: userQuestion,
              })}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <GitBranch className="h-3 w-3" />
              View on Graph
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
