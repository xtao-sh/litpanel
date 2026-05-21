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
      <div className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)]/20 px-4 py-4">
        <p className="text-sm font-medium text-[var(--ink)]">Project Comparison Matrix</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
          Select 2-8 papers from this project to generate a real compare-style matrix over research
          question, method, data, findings, and limitations.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px),1fr]">
        <Card className="rounded-[var(--r)] shadow-[var(--shadow-1)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GitCompareArrows className="h-4 w-4 text-[#2c4870]" />
              Compare Set
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resetSelection(Math.min(4, sortedPapers.length))}
                className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--line-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Newest 4
              </button>
              <button
                type="button"
                onClick={() => resetSelection(Math.min(8, sortedPapers.length))}
                className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--line-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Newest 8
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--line-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
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
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] px-3 py-1.5 text-xs font-medium text-[#223a5e] transition-colors hover:bg-[#e9eef6]"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Graph Selected Set
                </Link>
              )}
            </div>

            <div className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)] px-3 py-2 text-xs text-[var(--ink-4)]">
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
                    className={`w-full rounded-[var(--r)] border px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-[#bccbe0] bg-[#e9eef6]/70"
                        : "border-[var(--line-soft)] bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                    } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="mt-0.5 h-4 w-4 rounded border-[var(--line)] text-[#2c4870]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-[var(--ink)]">
                          {paper.title || paper.paperId}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-4)]">
                          <span className="font-mono">{paper.paperId}</span>
                          {paper.year && <span>{paper.year}</span>}
                          {paper.fields.slice(0, 2).map((field) => (
                            <span key={field} className="rounded bg-[var(--paper-2)] px-1.5 py-0.5">
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
            <Card className="rounded-[var(--r)] border-dashed shadow-[var(--shadow-1)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select at least 2 papers</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--ink-4)]">
                Choose a small subset from the project paper set to generate a detailed compare
                matrix.
              </CardContent>
            </Card>
          ) : loading ? (
            <ComparisonTableSkeleton />
          ) : error ? (
            <Card className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] shadow-[var(--shadow-1)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[#8a3318]">Comparison failed</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[#8a3318]">{error}</CardContent>
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
