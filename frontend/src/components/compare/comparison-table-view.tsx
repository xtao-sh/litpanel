"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

import { SectionContent } from "@/components/paper/section-content";
import { LitReviewModal } from "@/components/research/lit-review-modal";
import { CopyButton } from "@/components/shared/copy-button";
import { ExportMenu } from "@/components/shared/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComparisonResult } from "@/lib/types";

const COLUMN_LABELS: Record<string, string> = {
  research_question: "Research Question",
  method: "Method",
  data: "Data",
  key_finding: "Key Findings",
  limitation: "Limitations",
};

const ROW_COLORS: Record<string, string> = {
  research_question: "bg-blue-50/40",
  method: "bg-green-50/40",
  data: "bg-white",
  key_finding: "bg-amber-50/40",
  limitation: "bg-red-50/30",
};

const ROW_BORDER_COLORS: Record<string, string> = {
  research_question: "border-l-blue-400",
  method: "border-l-green-400",
  data: "border-l-gray-300",
  key_finding: "border-l-amber-400",
  limitation: "border-l-red-300",
};

function buildComparisonMarkdown(result: ComparisonResult): string {
  const lines: string[] = ["# Paper Comparison\n"];
  const headers = ["Dimension", ...result.papers.map((paper) => paper.title || paper.paper_id)];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const column of result.columns) {
    const label = COLUMN_LABELS[column] || column;
    const cells = result.papers.map((paper) =>
      (paper.cells[column] || "-").replace(/\|/g, "\\|").replace(/\n/g, " ")
    );
    lines.push(`| ${label} | ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

function ComparisonCell({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 300;

  if (!content) {
    return (
      <span className="text-xs italic text-muted-foreground">
        No deep-read card available
      </span>
    );
  }

  return (
    <div className="relative">
      <div
        className={`text-sm leading-relaxed ${!expanded && isLong ? "max-h-[150px] overflow-hidden" : ""}`}
      >
        <SectionContent content={content} />
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function ComparisonTableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <div className="min-w-[800px]">
          <div className="flex border-b border-gray-200 bg-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-1 p-4">
                <Skeleton className="mb-2 h-5 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex border-b border-gray-100">
              <div className="w-40 shrink-0 p-4">
                <Skeleton className="h-4 w-24" />
              </div>
              {Array.from({ length: 3 }).map((_, colIndex) => (
                <div key={colIndex} className="flex-1 p-4">
                  <Skeleton className="mb-2 h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="mt-1 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getSimilarity(texts: string[]): "similar" | "mixed" | "diverse" {
  const nonEmpty = texts.filter(t => t.length > 10);
  if (nonEmpty.length < 2) return "similar";

  // Simple word overlap check between pairs
  const wordSets = nonEmpty.map(t => new Set(t.toLowerCase().split(/\s+/).filter(w => w.length > 3)));
  let totalOverlap = 0;
  let pairs = 0;
  for (let i = 0; i < wordSets.length; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const overlap = [...wordSets[i]].filter(w => wordSets[j].has(w)).length;
      const maxSize = Math.max(wordSets[i].size, wordSets[j].size);
      totalOverlap += maxSize > 0 ? overlap / maxSize : 0;
      pairs++;
    }
  }
  const avgOverlap = pairs > 0 ? totalOverlap / pairs : 0;
  if (avgOverlap > 0.4) return "similar";
  if (avgOverlap > 0.15) return "mixed";
  return "diverse";
}

function getSimilarityIndicator(similarity: "similar" | "mixed" | "diverse") {
  const indicatorColor = similarity === "similar" ? "bg-green-500" : similarity === "mixed" ? "bg-yellow-500" : "bg-orange-500";
  const indicatorLabel = similarity === "similar" ? "Similar approaches" : similarity === "mixed" ? "Some differences" : "Divergent";
  return { indicatorColor, indicatorLabel };
}

interface ComparisonTableViewProps {
  result: ComparisonResult;
  paperIds: string[];
  title: string;
  subtitle: string;
  context?: string;
}

export function ComparisonTableView({
  result,
  paperIds,
  title,
  subtitle,
  context,
}: ComparisonTableViewProps) {
  const [litReviewOpen, setLitReviewOpen] = useState(false);
  const papers = result.papers;
  const paperCount = papers.length;
  const minCellWidth = paperCount <= 3 ? 280 : paperCount <= 5 ? 240 : 200;
  const markdown = useMemo(() => buildComparisonMarkdown(result), [result]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          {context && (
            <p className="mt-2 text-xs text-muted-foreground">
              Source context: {context}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu paperIds={paperIds} label="Export" />
          <CopyButton text={markdown} label="Copy Table" />
          <button
            type="button"
            onClick={() => setLitReviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Lit Review
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table
          className="w-full border-collapse text-left"
          style={{ minWidth: 160 + paperCount * minCellWidth }}
        >
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="sticky left-0 z-10 w-40 min-w-[160px] border-r border-gray-200 bg-gray-50 p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dimension
              </th>
              {papers.map((paper) => (
                <th
                  key={paper.paper_id}
                  className="border-r border-gray-100 p-4 align-top last:border-r-0"
                  style={{ minWidth: minCellWidth }}
                >
                  <Link
                    href={`/paper/${paper.paper_id}`}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    {paper.title || paper.paper_id}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{paper.paper_id}</span>
                    {paper.year && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>{paper.year}</span>
                      </>
                    )}
                  </div>
                  {paper.authors.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {paper.authors.join(", ")}
                    </p>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {result.columns.map((column, idx) => {
              const similarity = getSimilarity(papers.map(p => p.cells[column] || ""));
              const { indicatorColor, indicatorLabel } = getSimilarityIndicator(similarity);
              return (
              <tr
                key={column}
                className={`border-b border-gray-100 last:border-b-0 ${idx % 2 === 0 ? ROW_COLORS[column] || "bg-white" : "bg-white"}`}
              >
                <td
                  className={`sticky left-0 z-10 w-40 min-w-[160px] border-l-[3px] border-r border-gray-200 bg-inherit p-4 align-top text-sm font-semibold text-gray-900 ${ROW_BORDER_COLORS[column] || "border-l-gray-300"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${indicatorColor}`} title={indicatorLabel} />
                    <span>{COLUMN_LABELS[column] || column}</span>
                  </div>
                </td>
                {papers.map((paper) => (
                  <td
                    key={`${paper.paper_id}-${column}`}
                    className="border-r border-gray-100 p-4 align-top last:border-r-0"
                  >
                    <ComparisonCell content={paper.cells[column] || ""} />
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {litReviewOpen && (
        <LitReviewModal
          open={litReviewOpen}
          onClose={() => setLitReviewOpen(false)}
          paperIds={paperIds}
        />
      )}
    </div>
  );
}
