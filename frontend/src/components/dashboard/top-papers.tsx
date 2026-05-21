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
import { useI18n } from "@/lib/i18n/locale-context";

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
  if (score === null) return "bg-[var(--paper-2)] text-[var(--ink-4)]";
  if (score >= 8) return "bg-[var(--forest-soft)] text-[var(--forest-2)] font-semibold";
  if (score >= 6) return "bg-[#e9eef6] text-[#1b2e4d] font-semibold";
  if (score >= 4) return "bg-[#f4ead8] text-[#654814] font-medium";
  return "bg-[var(--paper-2)] text-[var(--ink-4)]";
}

function truncateTitle(title: string | null, fallback: string, max: number = 65): string {
  if (!title) return fallback;
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "\u2026";
}

export function TopPapers({ papers, loading }: TopPapersProps) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {t("dashboard.topPapers.title")}
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
                const fullTitle = paper.title || t("dashboard.topPapers.untitled");
                const displayTitle = truncateTitle(paper.title, t("dashboard.topPapers.untitled"));
                const needsTooltip = fullTitle.length > 65;

                const rowContent = (
                  <Link
                    key={paper.paperId}
                    href={`/paper/${paper.paperId}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-[var(--r)] hover:bg-[var(--paper-2)]/60 transition-colors group"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--paper-2)] text-xs font-medium text-[var(--ink-4)]">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-[var(--ink)] flex-1 min-w-0 truncate group-hover:text-[var(--forest)] transition-colors">
                      {displayTitle}
                    </span>
                    {paper.year && (
                      <span className="text-xs text-[var(--ink-4)] shrink-0">
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
