"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { activeLibraryFetch, getApiUrl, withActiveLibraryHeaders } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LitReviewModalProps {
  open: boolean;
  onClose: () => void;
  paperIds: string[];
  initialFocus?: string;
}

type ReviewStyle = "thematic" | "chronological" | "methodological";

const STYLE_OPTIONS: { value: ReviewStyle; label: string; desc: string }[] = [
  { value: "thematic", label: "Thematic", desc: "Group by research themes" },
  { value: "chronological", label: "Chronological", desc: "Trace evolution over time" },
  { value: "methodological", label: "Methodological", desc: "Group by methods used" },
];

// ---------------------------------------------------------------------------
// Markdown-like renderer (lightweight, no deps)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-semibold text-[var(--ink)] mt-6 mb-2">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-[var(--ink)] mt-4 mb-1.5">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-xl font-bold text-[var(--ink)] mt-6 mb-3">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="text-sm text-[var(--ink-4)] leading-relaxed ml-4 list-disc">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-[var(--ink-4)] leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderPaperLinks(text.slice(lastIndex, match.index)));
    }
    parts.push(
      <strong key={`b-${match.index}`} className="font-semibold">
        {renderPaperLinks(match[1])}
      </strong>
    );
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(renderPaperLinks(text.slice(lastIndex)));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderPaperLinks(text: string): React.ReactNode {
  // Match paper IDs like (w31161) or w31161
  const re = /\b(w\d{4,5})\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const pid = match[1];
    parts.push(
      <a
        key={`p-${match.index}`}
        href={`/paper/${pid}`}
        className="text-[#2c4870] hover:text-[#223a5e] hover:underline font-medium"
        target="_blank"
        rel="noopener noreferrer"
      >
        {pid}
      </a>
    );
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LitReviewModal({
  open,
  onClose,
  paperIds,
  initialFocus = "",
}: LitReviewModalProps) {
  const [style, setStyle] = useState<ReviewStyle>("thematic");
  const [focus, setFocus] = useState(initialFocus);
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [papersExpanded, setPapersExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom while generating
  useEffect(() => {
    if (isGenerating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isGenerating]);

  const handleGenerate = useCallback(async () => {
    setContent("");
    setError(null);
    setIsGenerating(true);
    setHasGenerated(true);

    abortRef.current = new AbortController();

    const apiUrl = getApiUrl();

    try {
      const resp = await activeLibraryFetch(`${apiUrl}/api/generate/lit-review`, {
        method: "POST",
        headers: withActiveLibraryHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          paper_ids: paperIds,
          focus: focus.trim(),
          style,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === "chunk") {
              setContent((prev) => prev + evt.text);
            } else if (evt.type === "done") {
              // Finished
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
      } else {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setIsGenerating(false);
    }
  }, [paperIds, focus, style]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(content).catch(() => {
      // Clipboard access can be blocked in embedded browsers.
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "literature-review.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [content]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { handleCancel(); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#2c4870]" />
            Generate Literature Review
          </DialogTitle>
          <DialogDescription>
            Generate a structured literature review from {paperIds.length} selected paper{paperIds.length !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        {/* Papers list (collapsible) */}
        <button
          type="button"
          onClick={() => setPapersExpanded(!papersExpanded)}
          className="flex items-center gap-1.5 text-xs text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors"
        >
          {papersExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {paperIds.length} paper{paperIds.length !== 1 ? "s" : ""} included
        </button>
        {papersExpanded && (
          <div className="max-h-32 overflow-y-auto rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-2">
            <div className="flex flex-wrap gap-1">
              {paperIds.map((id) => (
                <a
                  key={id}
                  href={`/paper/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded bg-[var(--paper)] border border-[var(--line-soft)] px-2 py-0.5 text-xs font-mono text-[#2c4870] hover:bg-[#e9eef6] transition-colors"
                >
                  {id}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Configuration */}
        {!hasGenerated && (
          <div className="space-y-3">
            {/* Style selector */}
            <div>
              <label className="text-xs font-medium text-[var(--ink-4)] mb-1.5 block">
                Organization Style
              </label>
              <div className="flex gap-2">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStyle(opt.value)}
                    className={`flex-1 rounded-[var(--r)] border px-3 py-2 text-left transition-colors ${
                      style === opt.value
                        ? "border-[#2c4870] bg-[#e9eef6] ring-1 ring-[#2c4870]"
                        : "border-[var(--line-soft)] hover:bg-[var(--paper-2)]/50"
                    }`}
                  >
                    <p className={`text-xs font-medium ${style === opt.value ? "text-[#223a5e]" : "text-[var(--ink-4)]"}`}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-[var(--ink-4)]">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Focus input */}
            <div>
              <label className="text-xs font-medium text-[var(--ink-4)] mb-1.5 block">
                Topic Focus (optional)
              </label>
              <input
                type="text"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g., causal identification strategies, effects on labor markets..."
                className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)]"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={paperIds.length === 0}
              className="w-full"
            >
              Generate Literature Review
            </Button>
          </div>
        )}

        {/* Content area */}
        {hasGenerated && (
          <>
            <div
              ref={contentRef}
              className="flex-1 overflow-y-auto rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-4 min-h-[300px] max-h-[50vh]"
            >
              {content ? (
                <div className="prose prose-sm max-w-none">
                  {renderMarkdown(content)}
                </div>
              ) : isGenerating ? (
                <div className="flex items-center gap-2 text-sm text-[var(--ink-4)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating literature review...
                </div>
              ) : null}

              {error && (
                <div className="rounded-[var(--r)] bg-[#f4dfd5] border border-[#da9a80] p-3 mt-4">
                  <p className="text-sm text-[#8a3318]">{error}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <Button variant="outline" onClick={handleCancel} className="gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => { setHasGenerated(false); setContent(""); setError(null); }}
                    className="gap-1.5 text-xs"
                  >
                    Reconfigure
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleGenerate}
                    className="gap-1.5 text-xs"
                  >
                    Regenerate
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!content}
                    className="gap-1.5 text-xs"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!content}
                    className="gap-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .md
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
