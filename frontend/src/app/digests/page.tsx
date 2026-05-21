"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo, Component } from "react";
import { useQuery } from "@apollo/client/react";
import { Newspaper, Calendar, AlertTriangle, Search } from "lucide-react";
import { GET_DIGESTS } from "@/lib/queries";
import { MarkdownRenderer } from "@/components/maps/markdown-renderer";
import { useI18n } from "@/lib/i18n/locale-context";

interface Digest {
  date: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function shortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysAgoLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const digestDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  digestDate.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - digestDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Content parsing helpers
// ---------------------------------------------------------------------------

function parseSections(content: string): { title: string; id: string }[] {
  const lines = content.split("\n");
  const sections: { title: string; id: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      const title = match[1].trim();
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      sections.push({ title, id });
    }
  }
  return sections;
}

function extractPaperIds(content: string): string[] {
  const pattern = /\bw(\d{4,5})\b/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    ids.add(`w${match[1]}`);
  }
  return Array.from(ids);
}

function extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, headings, and bullet points
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith(">")) continue;
    // Found a paragraph line
    const cleaned = trimmed.replace(/\*\*/g, "").replace(/\[([^\]]+)\]/g, "$1");
    if (cleaned.length <= 120) return cleaned;
    return cleaned.slice(0, 117) + "...";
  }
  return "No summary available";
}

// ---------------------------------------------------------------------------
// Error boundary to prevent MarkdownRenderer crashes from killing the page
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MarkdownErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-[var(--r)] border border-[#d6b678] bg-[#f4ead8] px-4 py-3 text-sm text-[#7a5a18]">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Unable to render this digest</span>
            </div>
            <p className="text-xs text-[#7a5a18]">
              The content could not be displayed. This is usually caused by unexpected formatting.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DigestsPage() {
  const { t } = useI18n();
  const { data, loading, error } = useQuery<{ digests: Digest[] }>(
    GET_DIGESTS,
    { variables: { limit: 30 } }
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const digests = data?.digests ?? [];

  // Filter digests by search query
  const filteredDigests = searchQuery.trim()
    ? digests.filter((d) =>
        d.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : digests;

  const activeDate = selectedDate ?? (filteredDigests.length > 0 ? filteredDigests[0].date : null);
  const activeDigest = digests.find((d) => d.date === activeDate);

  const sections = useMemo(
    () => (activeDigest ? parseSections(activeDigest.content) : []),
    [activeDigest]
  );
  const paperIds = useMemo(
    () => (activeDigest ? extractPaperIds(activeDigest.content) : []),
    [activeDigest]
  );

  // Scroll the active pill into view when it changes
  useEffect(() => {
    if (!activeDate || !pillsRef.current) return;
    const pill = pillsRef.current.querySelector(`[data-date="${activeDate}"]`);
    if (pill) {
      pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeDate]);

  // Track visible section on scroll
  useEffect(() => {
    if (!contentRef.current || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    const headings = contentRef.current.querySelectorAll("h2[id]");
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [sections, activeDigest]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="lp-card grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] text-[var(--forest)]">
              <Newspaper className="h-5 w-5" />
            </div>
            <p className="section-kicker">Daily Briefing</p>
          </div>
          <div>
            <h1 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
              Research Digests
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-4)] sm:text-[15px]">
              Daily summaries of new research, organized as briefings you can
              skim, search, and open as long-form archive notes.
            </p>
          </div>
        </div>
        <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
          <p className="section-kicker">{t("common.pageInfo")}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-3)]">
            Start here for recency. Move to Research or Projects when a digest
            deserves a deeper thematic read.
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-9 w-20 animate-pulse rounded-full bg-[var(--paper-2)]"
              />
            ))}
          </div>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded bg-[var(--paper-2)]"
                style={{ width: `${80 - i * 15}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="lp-card border-[#da9a80]/80 bg-[#f4dfd5]/80 px-4 py-3 text-sm text-[#8a3318] shadow-none">
          Failed to load digests: {error.message}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && digests.length === 0 && (
        <div className="lp-card flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--paper-2)]">
            <Newspaper className="h-7 w-7 text-[var(--ink-4)]" />
          </div>
          <p className="font-display text-2xl tracking-tight text-[var(--ink)]">
            No digests available yet.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--ink-4)]">
            No digests available yet. Digests will appear here once they are
            generated.
          </p>
        </div>
      )}

      {/* Main content */}
      {!loading && digests.length > 0 && (
        <div className="space-y-5">
          {/* Search input */}
          <div className="lp-card relative px-4 py-3 shadow-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]" />
            <input
              type="text"
              placeholder="Search digests by keyword..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedDate(null);
              }}
              className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] py-2.5 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] transition-colors focus:border-[var(--forest)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)]"
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">
                {filteredDigests.length} of {digests.length} digests
              </span>
            )}
          </div>

          {/* Scrollable date pills */}
          <div
            ref={pillsRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border"
          >
            {(() => {
              const filteredDates = new Set(filteredDigests.map((d) => d.date));
              return digests.map((digest) => {
                const isActive = activeDate === digest.date;
                const isMatched = filteredDates.has(digest.date);
                return (
                  <button
                    key={digest.date}
                    data-date={digest.date}
                    onClick={() => setSelectedDate(digest.date)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-[#f4ead8] text-[#654814] ring-1 ring-[#b88a3b]"
                        : "bg-[var(--paper-2)] text-[var(--ink-4)] hover:bg-[var(--paper-2)]"
                    } ${searchQuery && !isMatched ? "opacity-40" : ""}`}
                  >
                    <span className="block">{shortDate(digest.date)}</span>
                    <span className="block text-[10px] opacity-70">
                      {daysAgoLabel(digest.date)}
                    </span>
                  </button>
                );
              });
            })()}
          </div>

          {/* Digest overview grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDigests.map((digest) => {
              const isActive = activeDate === digest.date;
              const pIds = extractPaperIds(digest.content);
              const secs = parseSections(digest.content);
              return (
                <button
                  key={digest.date}
                  onClick={() => setSelectedDate(digest.date)}
                  className={`lp-card text-left p-4 transition-all hover:-translate-y-0.5 ${
                    isActive
                      ? "border-[var(--forest)] bg-[var(--paper-2)] shadow-[var(--shadow-1)] ring-1 ring-[var(--forest)]"
                      : "hover:border-[var(--line-soft)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      {shortDate(digest.date)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                      isActive
                        ? "bg-[var(--forest-soft)] text-[var(--forest)]"
                        : "bg-[var(--paper-2)] text-[var(--ink-4)]"
                    }`}>
                      {daysAgoLabel(digest.date)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-4)] leading-relaxed mb-3 line-clamp-2">
                    {extractSummary(digest.content)}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--ink-4)]">
                    {pIds.length > 0 && (
                      <span>{pIds.length} paper{pIds.length !== 1 ? "s" : ""}</span>
                    )}
                    {secs.length > 0 && (
                      <span>{secs.length} section{secs.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* No results for search */}
          {filteredDigests.length === 0 && searchQuery && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="mb-3 h-8 w-8 text-[var(--ink-4)]" />
              <p className="font-display text-2xl tracking-tight text-[var(--ink)]">
                No digests match &quot;{searchQuery}&quot;
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-3 text-xs font-medium text-[var(--forest)] underline"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Selected digest content */}
          {activeDigest && (
            <div className="lp-card overflow-hidden p-0">
              {/* Enhanced content header */}
              <div className="flex items-center gap-3 border-b border-[var(--line-soft)] px-5 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] text-[var(--forest)]">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-medium text-[var(--ink)]">
                    {formatDate(activeDigest.date)}
                  </h2>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-medium text-[var(--forest)]">
                      {daysAgoLabel(activeDigest.date)}
                    </span>
                    {paperIds.length > 0 && (
                      <span className="text-xs text-[var(--ink-4)]">
                        {paperIds.length} paper{paperIds.length !== 1 ? "s" : ""} mentioned
                      </span>
                    )}
                    {sections.length > 0 && (
                      <span className="text-xs text-[var(--ink-4)]">
                        {sections.length} section{sections.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Section navigation tabs */}
              {sections.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto border-b border-[var(--line-soft)] px-5 py-2 scrollbar-thin scrollbar-thumb-border">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          activeSection === section.id
                          ? "bg-[var(--paper-2)] text-[var(--ink)]"
                          : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                        }`}
                      >
                      {section.title}
                    </button>
                  ))}
                </div>
              )}

              {/* Markdown content wrapped in error boundary */}
              <div ref={contentRef} className="px-5 py-6">
                <MarkdownErrorBoundary>
                  <MarkdownRenderer content={activeDigest.content} />
                </MarkdownErrorBoundary>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
