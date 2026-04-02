"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckSquare, GitBranch, GitCompareArrows, MinusSquare, RotateCcw } from "lucide-react";

import { ComparisonTableSkeleton, ComparisonTableView } from "@/components/compare/comparison-table-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildProjectGraphHref } from "@/lib/navigation";
import type { Paper } from "@/lib/types";
import { useComparisonResult } from "@/lib/use-comparison-result";

interface ProjectMatrixPanelProps {
  papers: Paper[];
  projectTitle: string;
  projectSlug: string;
}

function buildDefaultSelection(papers: Paper[]): string[] {
  if (papers.length <= 4) {
    return papers.map((paper) => paper.paperId);
  }
  return papers.slice(0, 4).map((paper) => paper.paperId);
}

export function ProjectMatrixPanel({
  papers,
  projectTitle,
  projectSlug,
}: ProjectMatrixPanelProps) {
  const sortedPapers = useMemo(
    () =>
      [...papers].sort((a, b) => {
        const yearDiff = (b.year ?? 0) - (a.year ?? 0);
        if (yearDiff !== 0) return yearDiff;
        return (a.title || a.paperId).localeCompare(b.title || b.paperId);
      }),
    [papers]
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    buildDefaultSelection(sortedPapers)
  );

  const selectedCount = selectedIds.length;
  const hasEnoughForCompare = selectedCount >= 2;
  const canAddMore = selectedCount < 8;
  const { result, loading, error } = useComparisonResult(selectedIds);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (sortedPapers.length === 0) {
    return null;
  }

  function resetSelection(limit: number) {
    setSelectedIds(sortedPapers.slice(0, limit).map((paper) => paper.paperId));
  }

  function togglePaper(paperId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(paperId)) {
        return prev.filter((id) => id !== paperId);
      }
      if (prev.length >= 8) {
        return prev;
      }
      return [...prev, paperId];
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-foreground">Project Comparison Matrix</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Select 2-8 papers from this project to generate a real compare-style matrix over research
          question, method, data, findings, and limitations.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px),1fr]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GitCompareArrows className="h-4 w-4 text-blue-600" />
              Compare Set
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resetSelection(Math.min(4, sortedPapers.length))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Newest 4
              </button>
              <button
                type="button"
                onClick={() => resetSelection(Math.min(8, sortedPapers.length))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Newest 8
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MinusSquare className="h-3.5 w-3.5" />
                Clear
              </button>
              {selectedCount > 0 && (
                <Link
                  href={buildProjectGraphHref({
                    paperIds: selectedIds,
                    projectSlug,
                    projectTitle,
                    tab: "matrix",
                    label:
                      selectedCount === papers.length
                        ? projectTitle
                        : `${projectTitle} · ${selectedCount} selected papers`,
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Graph Selected Set
                </Link>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {selectedCount} selected out of {sortedPapers.length} project papers. The compare view
              is optimized for small, readable sets, so it is capped at 8 papers.
            </div>

            <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
              {sortedPapers.map((paper) => {
                const isSelected = selectedSet.has(paper.paperId);
                const isDisabled = !isSelected && !canAddMore;
                return (
                  <button
                    key={paper.paperId}
                    type="button"
                    onClick={() => togglePaper(paper.paperId)}
                    disabled={isDisabled}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-blue-300 bg-blue-50/70"
                        : "border-border bg-background hover:bg-accent/40"
                    } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {paper.title || paper.paperId}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{paper.paperId}</span>
                          {paper.year && <span>{paper.year}</span>}
                          {paper.fields.slice(0, 2).map((field) => (
                            <span key={field} className="rounded bg-muted px-1.5 py-0.5">
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!hasEnoughForCompare ? (
            <Card className="rounded-xl border-dashed shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select at least 2 papers</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Choose a small subset from the project paper set to generate a detailed compare
                matrix.
              </CardContent>
            </Card>
          ) : loading ? (
            <ComparisonTableSkeleton />
          ) : error ? (
            <Card className="rounded-xl border border-red-200 bg-red-50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">Comparison failed</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-red-700">{error}</CardContent>
            </Card>
          ) : result ? (
            <ComparisonTableView
              result={result}
              paperIds={selectedIds}
              title="Project Paper Comparison"
              subtitle={`Comparing ${selectedCount} selected paper${selectedCount !== 1 ? "s" : ""} from “${projectTitle}”.`}
              context={projectTitle}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
