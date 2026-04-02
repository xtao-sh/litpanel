"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, FileText, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOPIC_TIMELINE } from "@/lib/queries";
import type { TimelineYear, TimelinePaper } from "@/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimelineViewProps {
  query: string;
  limitPerYear?: number;
  compareIds: Set<string>;
  onToggleCompare: (paperId: string, e: React.MouseEvent) => void;
}

// ---------------------------------------------------------------------------
// Query result type
// ---------------------------------------------------------------------------

interface TopicTimelineResult {
  topicTimeline: {
    years: TimelineYear[];
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineView({
  query,
  limitPerYear = 5,
  compareIds,
  onToggleCompare,
}: TimelineViewProps) {
  const { data, loading, error } = useQuery<TopicTimelineResult>(TOPIC_TIMELINE, {
    variables: { query, limitPerYear },
    skip: !query,
  });

  const years = data?.topicTimeline?.years ?? [];

  // Track which years are expanded - expand all by default for first 10
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    return new Set<number>();
  });

  // On first load, expand the most recent years
  const [initialized, setInitialized] = useState(false);
  if (!initialized && years.length > 0) {
    const recentYears = years.slice(-8).map((y) => y.year);
    setExpanded(new Set(recentYears));
    setInitialized(true);
  }

  const toggleYear = (year: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4">
            <Skeleton className="h-6 w-16 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-red-500">
        Failed to load timeline: {error.message}
      </div>
    );
  }

  // Empty state
  if (years.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-sm text-muted-foreground">
        <Clock className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p>No timeline data available for this query.</p>
      </div>
    );
  }

  // Reverse to show newest first
  const sortedYears = [...years].reverse();

  return (
    <div className="overflow-y-auto p-2">
      {/* Timeline */}
      <div className="relative">
        {sortedYears.map((yearData, idx) => {
          const isExpanded = expanded.has(yearData.year);
          const isLast = idx === sortedYears.length - 1;

          return (
            <div key={yearData.year} className="relative flex gap-3">
              {/* Vertical timeline line */}
              <div className="flex flex-col items-center">
                {/* Dot */}
                <button
                  type="button"
                  onClick={() => toggleYear(yearData.year)}
                  className={cn(
                    "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    isExpanded
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-500 hover:border-blue-400"
                  )}
                >
                  {yearData.count}
                </button>
                {/* Line */}
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-gray-200" />
                )}
              </div>

              {/* Content */}
              <div className={cn("flex-1 pb-4", !isLast && "pb-6")}>
                {/* Year header */}
                <button
                  type="button"
                  onClick={() => toggleYear(yearData.year)}
                  className="flex items-center gap-2 mb-1.5 group"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold text-foreground">
                    {yearData.year}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {yearData.count} paper{yearData.count !== 1 ? "s" : ""}
                  </Badge>
                </button>

                {/* Papers list */}
                {isExpanded && (
                  <div className="space-y-1.5 ml-1">
                    {yearData.papers.map((paper) => (
                      <TimelinePaperCard
                        key={paper.paperId}
                        paper={paper}
                        compareIds={compareIds}
                        onToggleCompare={onToggleCompare}
                      />
                    ))}
                    {yearData.count > yearData.papers.length && (
                      <p className="text-[10px] text-muted-foreground pl-2">
                        + {yearData.count - yearData.papers.length} more paper
                        {yearData.count - yearData.papers.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paper card
// ---------------------------------------------------------------------------

function TimelinePaperCard({
  paper,
  compareIds,
  onToggleCompare,
}: {
  paper: TimelinePaper;
  compareIds: Set<string>;
  onToggleCompare: (paperId: string, e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/30",
        compareIds.has(paper.paperId) && "border-blue-200 bg-blue-50/50"
      )}
    >
      <div className="flex shrink-0 items-start pt-0.5" onClick={(e) => onToggleCompare(paper.paperId, e)}>
        <input
          type="checkbox"
          checked={compareIds.has(paper.paperId)}
          readOnly
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </div>
      <Link
        href={`/paper/${paper.paperId}`}
        className="flex min-w-0 flex-1 items-start gap-2"
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground line-clamp-2 leading-relaxed">
            {paper.title || paper.paperId}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {paper.averageScore != null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                <Star className="h-2.5 w-2.5 fill-current" />
                {paper.averageScore.toFixed(1)}
              </span>
            )}
            {paper.hasCard && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-300 text-green-700">
                Card
              </Badge>
            )}
            {paper.fields.slice(0, 2).map((f) => (
              <Badge key={f} variant="secondary" className="text-[9px] px-1 py-0">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
}
