"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { GET_JEL_TAXONOMY, GET_PAPERS_BY_JEL } from "@/lib/queries";
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
                      ? "bg-blue-50 text-blue-800 font-medium border-l-2 border-blue-500"
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
                      isActive ? "text-blue-600" : "text-muted-foreground"
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
                            ? "bg-blue-50 text-blue-800 font-medium"
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

  const { data, loading } = useQuery<{
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
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-mono font-bold text-lg">
              {code}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{heading}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {total.toLocaleString()} papers with JEL code {code}
              </p>
            </div>
          </div>
        </div>

        {/* Subcodes summary for first-level codes */}
        {isFirstLevel && category && category.subcodes.length > 0 && (
          <div className="rounded-lg border border-border p-4 space-y-2">
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
                  className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent/40 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground group-hover:text-blue-700 transition-colors line-clamp-1">
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
      <div className="text-center space-y-2">
        <Hash className="h-10 w-10 mx-auto opacity-40" />
        <p className="text-sm">Select a JEL code to explore papers in that category</p>
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

  const { data, loading } = useQuery<{ jelTaxonomy: JelCategory[] }>(
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
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-blue-600" />
          <h1 className="text-xl font-bold text-foreground">JEL Codes</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Browse papers by Journal of Economic Literature classification codes
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: JEL code list */}
        <div className="w-[300px] shrink-0 border-r border-border bg-background">
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
        <div className="flex-1 bg-background overflow-hidden">
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
