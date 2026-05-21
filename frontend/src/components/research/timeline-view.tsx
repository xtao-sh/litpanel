"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, FileText, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOPIC_TIMELINE } from "@/lib/queries";
import type { TimelineYear, TimelinePaper } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

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
  const { t } = useI18n();
  const { data, loading, error } = useQuery<TopicTimelineResult>(TOPIC_TIMELINE, {
    variables: { query, limitPerYear },
    skip: !query,
  });

  const years = useMemo(() => data?.topicTimeline?.years ?? [], [data?.topicTimeline?.years]);
  const defaultExpanded = useMemo(
    () => new Set(years.slice(-8).map((y) => y.year)),
    [years]
  );
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set<number>());
  const [hasManualExpansionState, setHasManualExpansionState] = useState(false);
  const visibleExpanded = hasManualExpansionState ? expanded : defaultExpanded;

  const toggleYear = (year: number) => {
    setHasManualExpansionState(true);
    setExpanded((prev) => {
      const next = new Set(hasManualExpansionState ? prev : visibleExpanded);
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
          <div key={i} className="lp-card flex items-start gap-4 rounded-[var(--r-md)] p-4">
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
      <div className="flex items-center justify-center p-8 text-sm text-[var(--rust)]">
        <div className="lp-card rounded-[var(--r-md)] px-5 py-4">
          {t("research.timeline.failed", { message: error.message })}
        </div>
      </div>
    );
  }

  // Empty state
  if (years.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-sm text-[var(--ink-4)]">
        <div className="lp-card rounded-[var(--r-md)] px-5 py-4 text-center">
          <Clock className="mx-auto mb-2 h-8 w-8 text-[var(--forest)]" />
          <p className="section-kicker">{t("research.timeline.kicker")}</p>
          <p className="mt-2">{t("research.timeline.empty")}</p>
        </div>
      </div>
    );
  }

  // Reverse to show newest first
  const sortedYears = [...years].reverse();

  return (
    <div className="overflow-y-auto p-2">
      {/* Timeline */}
      <div className="lp-card relative rounded-[var(--r-md)] p-4">
        {sortedYears.map((yearData, idx) => {
          const isExpanded = visibleExpanded.has(yearData.year);
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
                      ? "border-[var(--forest)] bg-[var(--forest-soft)] text-[var(--forest)]"
                      : "border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink-4)] hover:border-[var(--forest)]/40"
                  )}
                >
                  {yearData.count}
                </button>
                {/* Line */}
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-[var(--line-soft)]/80" />
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
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                  )}
                  <span className="font-display text-[1.25rem] text-[var(--ink)]">
                    {yearData.year}
                  </span>
                  <Badge variant="secondary" className="rounded-full text-[10px] px-1.5 py-0">
                    {t(yearData.count === 1 ? "research.timeline.paperCount" : "research.timeline.paperCountPlural", {
                      count: yearData.count,
                    })}
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
                      <p className="text-[10px] text-[var(--ink-4)] pl-2">
                        {t(
                          yearData.count - yearData.papers.length === 1
                            ? "research.timeline.morePapers"
                            : "research.timeline.morePapersPlural",
                          { count: yearData.count - yearData.papers.length }
                        )}
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
  const { t } = useI18n();

  return (
    <div
      className={cn(
        "lp-card flex items-start gap-2 rounded-[var(--r-md)] p-3 transition-colors hover:bg-[var(--paper-2)]",
        compareIds.has(paper.paperId) && "bg-[var(--paper-3)]"
      )}
    >
      <div className="flex shrink-0 items-start pt-0.5" onClick={(e) => onToggleCompare(paper.paperId, e)}>
        <input
          type="checkbox"
          checked={compareIds.has(paper.paperId)}
          readOnly
          className="h-3.5 w-3.5 rounded border-[var(--line)] text-[#2c4870] focus:ring-[var(--forest)] cursor-pointer"
        />
      </div>
      <Link
        href={`/paper/${paper.paperId}`}
        className="flex min-w-0 flex-1 items-start gap-2"
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--forest)]" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[1rem] text-[var(--ink)] line-clamp-2 leading-relaxed">
            {paper.title || paper.paperId}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {paper.averageScore != null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[#7a5a18]">
                <Star className="h-2.5 w-2.5 fill-current" />
                {paper.averageScore.toFixed(1)}
              </span>
            )}
            {paper.hasCard && (
              <Badge variant="outline" className="rounded-full text-[9px] px-1 py-0 border-[var(--forest)] text-[var(--forest-2)]">
                {t("research.timeline.card")}
              </Badge>
            )}
            {paper.fields.slice(0, 2).map((f) => (
              <Badge key={f} variant="secondary" className="rounded-full text-[9px] px-1 py-0">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
}
