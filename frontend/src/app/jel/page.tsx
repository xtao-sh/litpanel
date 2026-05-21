"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { GET_JEL_TAXONOMY, GET_PAPERS_BY_JEL } from "@/lib/queries";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Hash,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { JelCategory, Paper } from "@/lib/types";

// ---------------------------------------------------------------------------
// Left panel: JEL category list with expandable subcodes
// ---------------------------------------------------------------------------

function JelList({
  categories,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
  loading,
}: {
  categories: JelCategory[];
  selected: string | null;
  expanded: string | null;
  onSelect: (code: string) => void;
  onToggleExpand: (code: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full bg-[var(--paper-2)]" />
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-0.5">
        {categories.map((cat) => {
          const isExpanded = expanded === cat.code;
          const isActive = selected === cat.code;

          return (
            <div key={cat.code}>
              {/* First-level category */}
              <div className="flex items-center">
                <button
                  onClick={() => onToggleExpand(cat.code)}
                  className="shrink-0 p-1 rounded hover:bg-[var(--paper-2)]/60 transition-colors"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                  )}
                </button>
                <button
                  onClick={() => onSelect(cat.code)}
                  className={`flex-1 flex items-center justify-between rounded-[var(--r)] px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "lp-card border border-[var(--line-soft)] bg-[var(--paper-2)]/60 font-medium text-[var(--ink)] shadow-none"
                      : "text-[var(--ink-3)] hover:bg-[var(--paper-2)]/60"
                  }`}
                >
                  <span className="truncate text-left">
                    <span className="font-mono font-semibold mr-1.5">{cat.code}</span>
                    <span className="text-[var(--ink-4)]">-</span>
                    <span className="ml-1.5">{cat.label}</span>
                  </span>
                  <span
                    className={`ml-2 shrink-0 text-xs tabular-nums ${
                      isActive ? "text-[var(--forest)]" : "text-[var(--ink-4)]"
                    }`}
                  >
                    {cat.count.toLocaleString()}
                  </span>
                </button>
              </div>

              {/* Subcodes (expanded) */}
              {isExpanded && cat.subcodes.length > 0 && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-[var(--line-soft)] pl-2">
                  {cat.subcodes.map((sc) => {
                    const scActive = selected === sc.code;
                    return (
                      <button
                        key={sc.code}
                        onClick={() => onSelect(sc.code)}
                        className={`w-full flex items-center justify-between rounded-[var(--r)] px-2 py-1 text-xs transition-colors ${
                          scActive
                            ? "bg-[var(--paper-2)]/60 text-[var(--ink)] font-medium"
                            : "text-[var(--ink-4)] hover:bg-[var(--paper-2)]/60 hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-mono">{sc.code}</span>
                        <span className="tabular-nums">{sc.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Right panel: papers for selected JEL code
// ---------------------------------------------------------------------------

function JelDetailPanel({
  code,
  category,
}: {
  code: string;
  category: JelCategory | undefined;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, loading, error } = useQuery<{
    papersByJel: { items: Paper[]; total: number };
  }>(GET_PAPERS_BY_JEL, {
    variables: {
      code,
      limit: pageSize,
      offset: page * pageSize,
    },
    fetchPolicy: "cache-and-network",
  });

  const papers = data?.papersByJel?.items ?? [];
  const total = data?.papersByJel?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Determine heading
  const isFirstLevel = code.length === 1;
  const heading = isFirstLevel && category
    ? `${code} - ${category.label}`
    : code;

  return (
    <ScrollArea className="h-full">
      <div className="max-w-5xl space-y-6 p-6">
        {error && (
          <div className="lp-card border-[#da9a80]/80 bg-[#f4dfd5]/80 p-3 text-sm text-[#742b14] shadow-none">
            <p className="font-medium">Failed to load JEL detail.</p>
            <p className="mt-1 text-xs text-[#8a3318]">
              {collectErrorMessages([error]) || "Please refresh the page."}
            </p>
          </div>
        )}
        {/* Header */}
        <div className="lp-card p-5">
          <p className="section-kicker">Classification Dossier</p>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] font-mono text-lg font-bold text-[var(--forest)]">
              {code}
            </div>
            <div>
              <h2 className="font-display text-4xl tracking-tight text-[var(--ink)]">{heading}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-4)]">
                {total.toLocaleString()} papers with JEL code {code}
              </p>
            </div>
          </div>
        </div>

        {/* Subcodes summary for first-level codes */}
        {isFirstLevel && category && category.subcodes.length > 0 && (
          <div className="lp-card space-y-2 p-4 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
              Subcodes in this category
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {category.subcodes.slice(0, 30).map((sc) => (
                <Badge
                  key={sc.code}
                  variant="secondary"
                  className="text-[11px] font-mono"
                >
                  {sc.code}
                  <span className="ml-1 opacity-60">({sc.count})</span>
                </Badge>
              ))}
              {category.subcodes.length > 30 && (
                <span className="text-[11px] text-[var(--ink-4)] px-1">
                  +{category.subcodes.length - 30} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Papers list */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Papers</h3>

          {loading && papers.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-[var(--paper-2)]" />
              ))}
            </div>
          ) : papers.length === 0 ? (
            <p className="text-sm text-[var(--ink-4)] italic py-4">
              No papers found for JEL code {code}
            </p>
          ) : (
            <div className="space-y-1">
              {papers.map((p: Paper) => (
                <Link
                  key={p.paperId}
                  href={`/paper/${p.paperId}`}
                  className="flex items-start gap-3 rounded-[var(--r)] border border-[var(--line-soft)] p-3 transition-colors group hover:bg-[var(--paper-2)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-[var(--ink)] transition-colors group-hover:text-[var(--forest)]">
                        {p.title || p.paperId}
                      </span>
                      {p.hasCard && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Card
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.year && (
                        <span className="text-xs text-[var(--ink-4)]">{p.year}</span>
                      )}
                      {p.authors && p.authors.length > 0 && (
                        <span className="text-xs text-[var(--ink-4)] truncate max-w-[300px]">
                          {p.authors.slice(0, 3).join(", ")}
                          {p.authors.length > 3 && " et al."}
                        </span>
                      )}
                      {p.averageScore != null && (
                        <span className="text-xs text-[var(--ink-4)]">
                          Score: {p.averageScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {p.fields && p.fields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.fields.slice(0, 3).map((f) => (
                          <Badge key={f} variant="outline" className="text-[10px]">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-[var(--ink-4)] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-[var(--ink-4)]">
                Page {page + 1} of {totalPages} ({total.toLocaleString()} papers)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyDetail() {
  return (
    <div className="flex h-full items-center justify-center text-[var(--ink-4)]">
      <div className="lp-card space-y-2 px-8 py-10 text-center">
        <Hash className="mx-auto h-10 w-10 opacity-40" />
        <p className="font-display text-2xl tracking-tight text-[var(--ink)]">Select a JEL code</p>
        <p className="text-sm leading-6 text-[var(--ink-4)]">
          Open a classification bucket to inspect the papers and subcodes grouped under it.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function JelPage() {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const { data, loading, error } = useQuery<{ jelTaxonomy: JelCategory[] }>(
    GET_JEL_TAXONOMY,
    { fetchPolicy: "cache-first" }
  );

  const categories = data?.jelTaxonomy ?? [];
  const selectedCategory = categories.find((c) => c.code === selectedCode?.[0]);

  function handleToggleExpand(code: string) {
    setExpandedCode(expandedCode === code ? null : code);
  }

  function handleSelect(code: string) {
    setSelectedCode(code);
    // Auto-expand parent when selecting a first-level code
    if (code.length === 1) {
      setExpandedCode(expandedCode === code ? null : code);
    }
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {error && (
        <div className="mx-6 lp-card border-[#da9a80]/80 bg-[#f4dfd5]/80 p-3 text-sm text-[#742b14] shadow-none">
          <p className="font-medium">Failed to load JEL taxonomy.</p>
          <p className="mt-1 text-xs text-[#8a3318]">
            {collectErrorMessages([error]) || "Please refresh the page."}
          </p>
        </div>
      )}
      {/* Page header */}
      <div className="mx-6 shrink-0 lp-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] text-[var(--forest)]">
            <Hash className="h-5 w-5" />
          </div>
          <div>
            <p className="section-kicker">Reference Shelf</p>
            <h1 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">JEL Codes</h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-4)]">
          Browse papers by Journal of Economic Literature classification codes
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="mx-6 flex flex-1 overflow-hidden rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--shadow-2)]">
        {/* Left panel: JEL code list */}
        <div className="w-[300px] shrink-0 border-r border-[var(--line-soft)] bg-[var(--paper)]">
          <JelList
            categories={categories}
            selected={selectedCode}
            expanded={expandedCode}
            onSelect={handleSelect}
            onToggleExpand={handleToggleExpand}
            loading={loading}
          />
        </div>

        {/* Right panel: detail */}
        <div className="flex-1 overflow-hidden bg-[var(--paper)]">
          {selectedCode ? (
            <JelDetailPanel code={selectedCode} category={selectedCategory} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}
