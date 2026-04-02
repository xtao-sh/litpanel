"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PaperItem {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
}

interface TopPapersProps {
  papers: PaperItem[] | undefined;
  loading: boolean;
}

function scoreBadgeColor(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 8) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (score >= 6) return "bg-blue-100 text-blue-800 font-semibold";
  if (score >= 4) return "bg-amber-100 text-amber-800 font-medium";
  return "bg-muted text-muted-foreground";
}

function truncateTitle(title: string | null, max: number = 65): string {
  if (!title) return "Untitled";
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "\u2026";
}

export function TopPapers({ papers, loading }: TopPapersProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Highest Rated Papers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={300}>
          {loading || !papers ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-10 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {papers.map((paper, idx) => {
                const fullTitle = paper.title || "Untitled";
                const displayTitle = truncateTitle(paper.title);
                const needsTooltip = fullTitle.length > 65;

                const rowContent = (
                  <Link
                    key={paper.paperId}
                    href={`/paper/${paper.paperId}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/60 transition-colors group"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-foreground flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
                      {displayTitle}
                    </span>
                    {paper.year && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {paper.year}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs shrink-0 ${scoreBadgeColor(paper.averageScore)}`}
                    >
                      {paper.averageScore !== null
                        ? paper.averageScore.toFixed(1)
                        : "--"}
                    </span>
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
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
