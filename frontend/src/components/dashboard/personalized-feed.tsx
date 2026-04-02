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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBadgeColor(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 8) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (score >= 6) return "bg-blue-100 text-blue-800 font-semibold";
  if (score >= 4) return "bg-amber-100 text-amber-800 font-medium";
  return "bg-muted text-muted-foreground";
}

function relevancePct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function truncateTitle(title: string | null, max: number = 60): string {
  if (!title) return "Untitled";
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonalizedFeed() {
  const { data, loading } = useQuery<{
    personalizedFeed: RecommendedPaper[];
  }>(GET_PERSONALIZED_FEED, { variables: { limit: 8 } });

  const papers = data?.personalizedFeed;
  const hasRelevance = papers?.some((p) => p.relevanceScore > 0) ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-amber-500" style={{ strokeWidth: 1.75 }} />
          Recommended for You
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Bookmark some papers to get personalized recommendations.
            </p>
            <Link
              href="/explorer"
              className="text-sm font-medium text-primary hover:underline"
            >
              Go to Explorer
            </Link>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            {!hasRelevance && (
              <p className="mb-3 text-xs text-muted-foreground">
                Showing top-rated papers. Bookmark papers to personalize this feed.
              </p>
            )}
            <div className="space-y-0.5">
              {papers.map((paper) => {
                const fullTitle = paper.title || "Untitled";
                const displayTitle = truncateTitle(paper.title);
                const needsTooltip = fullTitle.length > 60;

                const rowContent = (
                  <Link
                    key={paper.paperId}
                    href={`/paper/${paper.paperId}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/60 transition-colors group"
                  >
                    <span className="text-sm text-foreground flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
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
                        <span className="text-xs text-muted-foreground">
                          {paper.year}
                        </span>
                      )}
                      {hasRelevance && paper.relevanceScore > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {relevancePct(paper.relevanceScore)} match
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
