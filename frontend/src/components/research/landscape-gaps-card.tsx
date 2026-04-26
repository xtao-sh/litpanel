"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchGaps } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

interface LandscapeGapsCardProps {
  gaps: ResearchGaps;
  onAtomClick: (slug: string) => void;
  getExplorerHref?: (slug: string) => string;
  getPaperHref?: (paperId: string) => string;
  actionMode?: "compact" | "buttons";
}

function GapSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  if (count === 0) return null;

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-2 py-1.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-amber-600 transition-transform",
            !expanded && "-rotate-90"
          )}
        />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-medium text-amber-700">
          {count}
        </span>
      </button>
      {expanded && <div className="ml-5 space-y-1.5 pb-2">{children}</div>}
    </div>
  );
}

export function LandscapeGapsCard({
  gaps,
  onAtomClick,
  getExplorerHref,
  getPaperHref,
  actionMode = "compact",
}: LandscapeGapsCardProps) {
  const { t } = useI18n();
  const totalGaps =
    gaps.unusedMethods.length +
    gaps.unusedDatasets.length +
    gaps.openQuestions.length +
    gaps.limitations.length;

  if (totalGaps === 0) return null;

  return (
    <Card className="rounded-xl border-amber-200 shadow-sm ring-1 ring-amber-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {t("research.gaps.title")}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {t("research.gaps.identified", { count: totalGaps })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Unexplored Methods */}
        <GapSection title={t("research.gaps.unusedMethods")} count={gaps.unusedMethods.length}>
          {gaps.unusedMethods.map((method) => (
            <div
              key={method.slug}
              className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-accent/30"
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-xs font-medium text-foreground hover:text-primary"
                  onClick={() => onAtomClick(method.slug)}
                >
                  {method.title}
                  {method.description && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      -- {method.description.length > 80 ? method.description.slice(0, 80) + "..." : method.description}
                    </span>
                  )}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(method.slug)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        {t("common.actions.details")}
                    </button>
                    {getExplorerHref && (
                      <Link
                        href={getExplorerHref(method.slug)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        <Filter className="h-3 w-3" />
                        {t("research.gaps.openExplorer")}
                      </Link>
                    )}
                  </div>
                )}
              </div>
              {actionMode === "compact" && getExplorerHref && (
                <Link
                  href={getExplorerHref(method.slug)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-amber-700 transition-colors"
                  title="Open this gap in Explorer"
                >
                  <Filter className="h-3 w-3" />
                </Link>
              )}
              <Badge variant="method" className="shrink-0 text-[10px]">
                {method.paperCount}
              </Badge>
            </div>
          ))}
        </GapSection>

        {/* Available Datasets */}
        <GapSection title={t("research.gaps.unusedDatasets")} count={gaps.unusedDatasets.length}>
          {gaps.unusedDatasets.map((dataset) => (
            <div
              key={dataset.slug}
              className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-accent/30"
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-xs font-medium text-foreground hover:text-primary"
                  onClick={() => onAtomClick(dataset.slug)}
                >
                  {dataset.title}
                  {dataset.description && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      -- {dataset.description.length > 80 ? dataset.description.slice(0, 80) + "..." : dataset.description}
                    </span>
                  )}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(dataset.slug)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        {t("common.actions.details")}
                    </button>
                    {getExplorerHref && (
                      <Link
                        href={getExplorerHref(dataset.slug)}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        <Filter className="h-3 w-3" />
                        {t("research.gaps.openExplorer")}
                      </Link>
                    )}
                  </div>
                )}
              </div>
              {actionMode === "compact" && getExplorerHref && (
                <Link
                  href={getExplorerHref(dataset.slug)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-amber-700 transition-colors"
                  title="Open this gap in Explorer"
                >
                  <Filter className="h-3 w-3" />
                </Link>
              )}
              {dataset.access && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                    dataset.access === "public"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  )}
                >
                  {dataset.access}
                </span>
              )}
            </div>
          ))}
        </GapSection>

        {/* Open Questions */}
        <GapSection title={t("research.gaps.openQuestions")} count={gaps.openQuestions.length}>
          {gaps.openQuestions.map((q, idx) => (
            <div
              key={`oq-${idx}`}
              className="rounded-md px-1 py-1 text-xs leading-relaxed text-muted-foreground hover:bg-accent/30"
            >
              <span className="text-foreground">{q.text}</span>
              {actionMode === "buttons" ? (
                <Link
                  href={getPaperHref ? getPaperHref(q.paperId) : `/paper/${q.paperId}`}
                  className="ml-2 inline-flex rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t("research.gaps.openPaper")}
                </Link>
              ) : (
                <Link
                  href={getPaperHref ? getPaperHref(q.paperId) : `/paper/${q.paperId}`}
                  className="ml-1 font-mono text-[10px] text-blue-600 hover:underline"
                >
                  {q.paperId}
                </Link>
              )}
            </div>
          ))}
        </GapSection>

        {/* Limitations */}
        <GapSection title={t("research.gaps.limitations")} count={gaps.limitations.length}>
          {gaps.limitations.map((lim, idx) => (
            <div
              key={`lim-${idx}`}
              className="rounded-md px-1 py-1 text-xs leading-relaxed text-muted-foreground hover:bg-accent/30"
            >
              <span className="text-foreground">{lim.text}</span>
              {actionMode === "buttons" ? (
                <Link
                  href={getPaperHref ? getPaperHref(lim.paperId) : `/paper/${lim.paperId}`}
                  className="ml-2 inline-flex rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t("research.gaps.openPaper")}
                </Link>
              ) : (
                <Link
                  href={getPaperHref ? getPaperHref(lim.paperId) : `/paper/${lim.paperId}`}
                  className="ml-1 font-mono text-[10px] text-blue-600 hover:underline"
                >
                  {lim.paperId}
                </Link>
              )}
            </div>
          ))}
        </GapSection>
      </CardContent>
    </Card>
  );
}
