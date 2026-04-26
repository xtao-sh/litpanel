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
          <Skeleton key={i} className="h-8 w-full bg-gray-100" />
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
                  className="shrink-0 p-1 rounded hover:bg-accent/60 transition-colors"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => onSelect(cat.code)}
                  className={`flex-1 flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "paper-panel border border-border/70 bg-accent/60 font-medium text-foreground shadow-none"
                      : "text-foreground/80 hover:bg-accent/60"
                  }`}
                >
                  <span className="truncate text-left">
                    <span className="font-mono font-semibold mr-1.5">{cat.code}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="ml-1.5">{cat.label}</span>
                  </span>
                  <span
                    className={`ml-2 shrink-0 text-xs tabular-nums ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {cat.count.toLocaleString()}
                  </span>
                </button>
              </div>

              {/* Subcodes (expanded) */}
              {isExpanded && cat.subcodes.length > 0 && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {cat.subcodes.map((sc) => {
                    const scActive = selected === sc.code;
                    return (
                      <button
                        key={sc.code}
                        onClick={() => onSelect(sc.code)}
                        className={`w-full flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${
                          scActive
                            ? "bg-accent/60 text-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
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
          <div className="paper-panel border-red-200/80 bg-red-50/80 p-3 text-sm text-red-800 shadow-none">
            <p className="font-medium">Failed to load JEL detail.</p>
            <p className="mt-1 text-xs text-red-700">
              {collectErrorMessages([error]) || "Please refresh the page."}
            </p>
          </div>
        )}
        {/* Header */}
        <div className="paper-panel p-5">
          <p className="section-kicker">Classification Dossier</p>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-border/70 bg-accent/55 font-mono text-lg font-bold text-primary">
              {code}
            </div>
            <div>
              <h2 className="font-display text-4xl tracking-tight text-foreground">{heading}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {total.toLocaleString()} papers with JEL code {code}
              </p>
            </div>
          </div>
        </div>

        {/* Subcodes summary for first-level codes */}
        {isFirstLevel && category && category.subcodes.length > 0 && (
          <div className="paper-panel space-y-2 p-4 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <span className="text-[11px] text-muted-foreground px-1">
                  +{category.subcodes.length - 30} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Papers list */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Papers</h3>

          {loading && papers.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-gray-100" />
              ))}
            </div>
          ) : papers.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No papers found for JEL code {code}
            </p>
          ) : (
            <div className="space-y-1">
              {papers.map((p: Paper) => (
                <Link
                  key={p.paperId}
                  href={`/paper/${p.paperId}`}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 p-3 transition-colors group hover:bg-accent/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
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
                        <span className="text-xs text-muted-foreground">{p.year}</span>
                      )}
                      {p.authors && p.authors.length > 0 && (
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {p.authors.slice(0, 3).join(", ")}
                          {p.authors.length > 3 && " et al."}
                        </span>
                      )}
                      {p.averageScore != null && (
                        <span className="text-xs text-muted-foreground">
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
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
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
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="paper-panel space-y-2 px-8 py-10 text-center">
        <Hash className="mx-auto h-10 w-10 opacity-40" />
        <p className="font-display text-2xl tracking-tight text-foreground">Select a JEL code</p>
        <p className="text-sm leading-6 text-muted-foreground">
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
        <div className="mx-6 paper-panel border-red-200/80 bg-red-50/80 p-3 text-sm text-red-800 shadow-none">
          <p className="font-medium">Failed to load JEL taxonomy.</p>
          <p className="mt-1 text-xs text-red-700">
            {collectErrorMessages([error]) || "Please refresh the page."}
          </p>
        </div>
      )}
      {/* Page header */}
      <div className="mx-6 shrink-0 paper-panel p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] border border-border/70 bg-accent/55 text-primary">
            <Hash className="h-5 w-5" />
          </div>
          <div>
            <p className="section-kicker">Reference Shelf</p>
            <h1 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">JEL Codes</h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Browse papers by Journal of Economic Literature classification codes
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="mx-6 flex flex-1 overflow-hidden rounded-[1.75rem] border border-border/75 bg-background/92 shadow-[0_24px_60px_rgba(44,51,71,0.08)]">
        {/* Left panel: JEL code list */}
        <div className="w-[300px] shrink-0 border-r border-border/70 bg-background/85">
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
        <div className="flex-1 overflow-hidden bg-background/70">
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
