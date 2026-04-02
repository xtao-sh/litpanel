"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { GET_FRONTIER_GAPS } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  FileText,
  Filter,
  Lightbulb,
  Link2,
  Search,
  Sparkles,
} from "lucide-react";
import type { FrontierGap } from "@/lib/types";

// ---------------------------------------------------------------------------
// Feasibility helpers
// ---------------------------------------------------------------------------

type FeasibilityLevel = "High" | "Medium" | "Low";

function parseFeasibilityLevel(feasibility: string): FeasibilityLevel {
  const lower = feasibility.toLowerCase();
  if (lower.startsWith("high")) return "High";
  if (lower.startsWith("low")) return "Low";
  return "Medium";
}

const FEASIBILITY_COLORS: Record<FeasibilityLevel, string> = {
  High: "bg-green-100 text-green-800 border-green-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-200",
  Low: "bg-red-100 text-red-800 border-red-200",
};

// ---------------------------------------------------------------------------
// Feasibility badge
// ---------------------------------------------------------------------------

function FeasibilityBadge({ feasibility }: { feasibility: string }) {
  const level = parseFeasibilityLevel(feasibility);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${FEASIBILITY_COLORS[level]}`}
    >
      {level} Feasibility
    </span>
  );
}

// ---------------------------------------------------------------------------
// "What's needed" rendered as checklist-style items
// ---------------------------------------------------------------------------

function WhatIsNeeded({ text }: { text: string }) {
  // Split on "- " items at line starts
  const items = text
    .split(/\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  if (items.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
          <CheckSquare className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

type SortOption = "default" | "high-first" | "low-first" | "most-papers";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "high-first", label: "High Feasibility First" },
  { value: "low-first", label: "Low Feasibility First" },
  { value: "most-papers", label: "Most Papers" },
];

const FEASIBILITY_ORDER: Record<FeasibilityLevel, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({
  gaps,
  filterLevel,
  onFilterChange,
  sortOption,
  onSortChange,
}: {
  gaps: FrontierGap[];
  filterLevel: FeasibilityLevel | "All";
  onFilterChange: (level: FeasibilityLevel | "All") => void;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}) {
  const counts = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const g of gaps) {
      const l = parseFeasibilityLevel(g.feasibility);
      if (l === "High") high++;
      else if (l === "Medium") medium++;
      else low++;
    }
    return { high, medium, low, total: gaps.length };
  }, [gaps]);

  return (
    <div className="space-y-3">
      {/* Counts bar */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{counts.total} gaps total</span>
        <span className="text-border">|</span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${FEASIBILITY_COLORS.High}`}>
          {counts.high} High
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${FEASIBILITY_COLORS.Medium}`}>
          {counts.medium} Medium
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${FEASIBILITY_COLORS.Low}`}>
          {counts.low} Low
        </span>
        <span className="text-border">|</span>
        <span className="text-xs italic">
          Promising research frontiers where significant contributions could be made
        </span>
      </div>

      {/* Filter + sort controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter buttons */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground mr-1">Filter:</span>
          {(["All", "High", "Medium", "Low"] as const).map((level) => (
            <button
              key={level}
              onClick={() => onFilterChange(level)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                filterLevel === level
                  ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Sort:</span>
          <select
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single gap card
// ---------------------------------------------------------------------------

function GapCard({
  gap,
  index,
  paperTitleMap,
  relatedGaps,
}: {
  gap: FrontierGap;
  index: number;
  paperTitleMap: Map<string, string>;
  relatedGaps: { gapIndex: number; gapTitle: string }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-bold text-sm">
              {index + 1}
            </div>
            <h3 className="text-lg font-semibold text-foreground leading-snug">
              {gap.title}
            </h3>
          </div>
          <FeasibilityBadge feasibility={gap.feasibility} />
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Description */}
        <p className="text-sm text-foreground/80 leading-relaxed">
          {gap.description}
        </p>

        {/* Why it matters callout */}
        {gap.whyItMatters && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Why it matters
              </span>
            </div>
            <p className="text-sm text-amber-900/80 leading-relaxed">
              {gap.whyItMatters}
            </p>
          </div>
        )}

        {/* What's needed */}
        {gap.whatIsNeeded && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              What is needed
            </div>
            <WhatIsNeeded text={gap.whatIsNeeded} />
          </div>
        )}

        {/* Closest papers -- with title tooltips */}
        {gap.closestPaperIds.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Closest papers
            </div>
            <div className="flex flex-wrap gap-1.5">
              {gap.closestPaperIds.map((id) => {
                const title = paperTitleMap.get(id);
                return (
                  <Link key={id} href={`/paper/${id}`}>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer font-mono text-xs hover:bg-blue-100 hover:text-blue-800 transition-colors"
                      title={title ? title : undefined}
                    >
                      {id}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Feasibility details */}
        {gap.feasibility && (
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground/70">Feasibility: </span>
              {gap.feasibility}
            </p>
          </div>
        )}

        {/* Related gaps */}
        {relatedGaps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-medium">Related:</span>
            {relatedGaps.map((rg) => (
              <span
                key={rg.gapIndex}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                title={rg.gapTitle}
              >
                Gap {rg.gapIndex + 1}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-1">
          <Link
            href={`/research?q=${encodeURIComponent(gap.title)}`}
            className="inline-flex"
          >
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Explore this gap
            </Button>
          </Link>
          <Link
            href={`/ideas/workspace?title=${encodeURIComponent(gap.title)}&description=${encodeURIComponent(gap.description)}`}
            className="inline-flex"
          >
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Lightbulb className="h-3.5 w-3.5" />
              Start an idea
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function GapsSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-6 space-y-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FrontierGapsInteractive() {
  const { data, loading, error } = useQuery<{
    frontierGaps: FrontierGap[];
  }>(GET_FRONTIER_GAPS);

  const [filterLevel, setFilterLevel] = useState<FeasibilityLevel | "All">("All");
  const [sortOption, setSortOption] = useState<SortOption>("default");

  // Build a lookup map: paperId -> title from all gaps' closestPaperTitles
  const paperTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!data?.frontierGaps) return map;
    for (const gap of data.frontierGaps) {
      if (gap.closestPaperTitles) {
        for (const pt of gap.closestPaperTitles) {
          if (pt.paperId && pt.title) {
            map.set(pt.paperId, pt.title);
          }
        }
      }
    }
    return map;
  }, [data]);

  // Compute related gaps: for each gap index, list indices of other gaps
  // that share at least one closest paper
  const relatedGapsMap = useMemo(() => {
    const gaps = data?.frontierGaps ?? [];
    // Build paper -> gap indices map
    const paperToGaps = new Map<string, number[]>();
    gaps.forEach((gap, i) => {
      for (const pid of gap.closestPaperIds) {
        const existing = paperToGaps.get(pid);
        if (existing) existing.push(i);
        else paperToGaps.set(pid, [i]);
      }
    });
    // For each gap, collect related gaps
    const result = new Map<number, { gapIndex: number; gapTitle: string }[]>();
    gaps.forEach((gap, i) => {
      const relatedSet = new Set<number>();
      for (const pid of gap.closestPaperIds) {
        const sharingGaps = paperToGaps.get(pid);
        if (sharingGaps) {
          for (const j of sharingGaps) {
            if (j !== i) relatedSet.add(j);
          }
        }
      }
      const related = Array.from(relatedSet)
        .sort((a, b) => a - b)
        .map((j) => ({ gapIndex: j, gapTitle: gaps[j].title }));
      result.set(i, related);
    });
    return result;
  }, [data]);

  // Apply filter and sort
  const processedGaps = useMemo(() => {
    const gaps = data?.frontierGaps ?? [];
    // Keep original indices for related gaps reference
    let indexed = gaps.map((gap, i) => ({ gap, originalIndex: i }));

    // Filter
    if (filterLevel !== "All") {
      indexed = indexed.filter(
        ({ gap }) => parseFeasibilityLevel(gap.feasibility) === filterLevel
      );
    }

    // Sort
    if (sortOption === "high-first") {
      indexed.sort(
        (a, b) =>
          FEASIBILITY_ORDER[parseFeasibilityLevel(a.gap.feasibility)] -
          FEASIBILITY_ORDER[parseFeasibilityLevel(b.gap.feasibility)]
      );
    } else if (sortOption === "low-first") {
      indexed.sort(
        (a, b) =>
          FEASIBILITY_ORDER[parseFeasibilityLevel(b.gap.feasibility)] -
          FEASIBILITY_ORDER[parseFeasibilityLevel(a.gap.feasibility)]
      );
    } else if (sortOption === "most-papers") {
      indexed.sort(
        (a, b) => b.gap.closestPaperIds.length - a.gap.closestPaperIds.length
      );
    }

    return indexed;
  }, [data, filterLevel, sortOption]);

  if (loading) return <GapsSkeleton />;

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load frontier gaps data.
      </div>
    );
  }

  const gaps = data?.frontierGaps ?? [];

  if (gaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No frontier gaps data available.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar with filter/sort controls */}
      <SummaryBar
        gaps={gaps}
        filterLevel={filterLevel}
        onFilterChange={setFilterLevel}
        sortOption={sortOption}
        onSortChange={setSortOption}
      />

      {/* Gap cards */}
      {processedGaps.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No gaps match the selected filter.
        </p>
      ) : (
        processedGaps.map(({ gap, originalIndex }) => (
          <GapCard
            key={originalIndex}
            gap={gap}
            index={originalIndex}
            paperTitleMap={paperTitleMap}
            relatedGaps={relatedGapsMap.get(originalIndex) ?? []}
          />
        ))
      )}
    </div>
  );
}
