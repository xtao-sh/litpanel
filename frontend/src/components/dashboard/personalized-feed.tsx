"use client";

import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Sparkles, Search } from "lucide-react";

import { GET_PERSONALIZED_FEED } from "@/lib/queries";
import type { RecommendedPaper } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBadgeColor(score: number | null): string {
  if (score === null) return "bg-[var(--paper-2)] text-[var(--ink-4)]";
  if (score >= 8) return "bg-[var(--forest-soft)] text-[var(--forest-2)] font-semibold";
  if (score >= 6) return "bg-[#e9eef6] text-[#1b2e4d] font-semibold";
  if (score >= 4) return "bg-[#f4ead8] text-[#654814] font-medium";
  return "bg-[var(--paper-2)] text-[var(--ink-4)]";
}

function relevancePct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function truncateTitle(title: string | null, fallback: string, max: number = 60): string {
  if (!title) return fallback;
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonalizedFeed() {
  const { t } = useI18n();
  const { data, loading } = useQuery<{
    personalizedFeed: RecommendedPaper[];
  }>(GET_PERSONALIZED_FEED, { variables: { limit: 8 } });

  const papers = data?.personalizedFeed;
  const hasRelevance = papers?.some((p) => p.relevanceScore > 0) ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-[#8a6d3b]" style={{ strokeWidth: 1.75 }} />
          {t("dashboard.personalized.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-10 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : !papers || papers.length === 0 ? (
          /* Cold-start / empty state */
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--paper-2)]">
              <Search className="h-5 w-5 text-[var(--ink-4)]" />
            </div>
            <p className="text-sm text-[var(--ink-4)] max-w-xs">
              {t("dashboard.personalized.empty")}
            </p>
            <Link
              href="/explorer"
              className="text-sm font-medium text-[var(--forest)] hover:underline"
            >
              {t("dashboard.actions.goToExplorer")}
            </Link>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            {!hasRelevance && (
              <p className="mb-3 text-xs text-[var(--ink-4)]">
                {t("dashboard.personalized.fallback")}
              </p>
            )}
            <div className="space-y-0.5">
              {papers.map((paper) => {
                const fullTitle = paper.title || t("dashboard.common.untitled");
                const displayTitle = truncateTitle(paper.title, t("dashboard.common.untitled"));
                const needsTooltip = fullTitle.length > 60;

                const rowContent = (
                  <Link
                    key={paper.paperId}
                    href={`/paper/${paper.paperId}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-[var(--r)] hover:bg-[var(--paper-2)]/60 transition-colors group"
                  >
                    <span className="text-sm text-[var(--ink)] flex-1 min-w-0 truncate group-hover:text-[var(--forest)] transition-colors">
                      {displayTitle}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {paper.fields.slice(0, 1).map((f) => (
                        <Badge
                          key={f}
                          variant="secondary"
                          className="text-xs px-1.5 py-0 hidden md:inline-flex"
                        >
                          {f}
                        </Badge>
                      ))}
                      {paper.year && (
                        <span className="text-xs text-[var(--ink-4)]">
                          {paper.year}
                        </span>
                      )}
                      {hasRelevance && paper.relevanceScore > 0 && (
                        <span className="inline-flex items-center rounded-full bg-[#f4ead8] px-2 py-0.5 text-xs font-medium text-[#7a5a18]">
                          {t("dashboard.personalized.match", { pct: relevancePct(paper.relevanceScore) })}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${scoreBadgeColor(paper.averageScore)}`}
                      >
                        {paper.averageScore !== null
                          ? paper.averageScore.toFixed(1)
                          : "--"}
                      </span>
                    </div>
                  </Link>
                );

                if (needsTooltip) {
                  return (
                    <Tooltip key={paper.paperId}>
                      <TooltipTrigger asChild>{rowContent}</TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm">
                        <p className="text-sm">{fullTitle}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return rowContent;
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
