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
  research_question: "bg-[#e9eef6]/55",
  method: "bg-[var(--forest-soft)]/55",
  data: "bg-[var(--paper)]",
  key_finding: "bg-[#f4ead8]/55",
  limitation: "bg-[#f4dfd5]/45",
};

const ROW_BORDER_COLORS: Record<string, string> = {
  research_question: "border-l-[#2c4870]",
  method: "border-l-[var(--forest)]",
  data: "border-l-border",
  key_finding: "border-l-[#b88a3b]",
  limitation: "border-l-[#da9a80]",
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
      <span className="text-xs italic text-[var(--ink-4)]">
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
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-2 py-1 text-[11px] font-medium text-[var(--forest)] hover:bg-[var(--paper-2)]"
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
      <div className="lp-card overflow-x-auto rounded-[var(--r-md)] border border-[var(--line-soft)]">
        <div className="min-w-[800px]">
          <div className="flex border-b border-[var(--line-soft)] bg-[var(--paper-2)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-1 p-4">
                <Skeleton className="mb-2 h-5 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex border-b border-[var(--line-soft)]">
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
  const indicatorColor = similarity === "similar" ? "bg-[var(--forest)]" : similarity === "mixed" ? "bg-[#b88a3b]" : "bg-[#b88a3b]";
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
      <div className="lp-card flex flex-col gap-4 rounded-[var(--r-md)] p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="section-kicker">Comparison dossier</p>
          <h2 className="font-display mt-2 text-[2rem] tracking-tight text-[var(--ink)]">{title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-4)]">{subtitle}</p>
          {context && (
            <p className="mt-3 text-xs text-[var(--ink-4)]">
              Source context: {context}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu paperIds={paperIds} label="Export" />
          <CopyButton text={markdown} label="Copy Table" />
          <button
            type="button"
            onClick={() => setLitReviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--forest)] bg-[var(--forest-soft)] px-3.5 py-2 text-xs font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest-soft)]"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Lit Review
          </button>
        </div>
      </div>

      <div className="lp-card rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--ink-4)]">
            Comparison grid
          </p>
          <p className="text-xs text-[var(--ink-4)]">
            Scroll horizontally to inspect every paper column.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-[var(--ink-4)] px-5 pt-3 mb-0">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--forest)]" /> High agreement</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b88a3b]" /> Partial agreement</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b88a3b]" /> Low agreement</span>
        </div>
        <div className="relative overflow-x-auto">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-6 bg-gradient-to-r from-[var(--paper)] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-[var(--paper)] to-transparent" />
          <table
            className="w-full border-collapse text-left"
            style={{ minWidth: 160 + paperCount * minCellWidth }}
          >
          <thead>
            <tr className="border-b border-[var(--line-soft)] bg-[var(--paper-2)]">
              <th className="sticky left-0 z-10 w-40 min-w-[160px] border-r border-[var(--line-soft)] bg-[var(--paper-2)] p-4 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--ink-4)]">
                Dimension
              </th>
              {papers.map((paper) => (
                <th
                  key={paper.paper_id}
                  className="border-r border-[var(--line-soft)] p-4 align-top last:border-r-0"
                  style={{ minWidth: minCellWidth }}
                >
                  <Link
                    href={`/paper/${paper.paper_id}`}
                    className="font-display text-[1.1rem] text-[var(--ink)] hover:text-[var(--forest)]"
                  >
                    {paper.title || paper.paper_id}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--ink-4)]">
                    <span className="font-mono">{paper.paper_id}</span>
                    {paper.year && (
                      <>
                        <span className="text-[var(--ink-5)]">|</span>
                        <span>{paper.year}</span>
                      </>
                    )}
                  </div>
                  {paper.authors.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--ink-4)]">
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
                className={`border-b border-[var(--line-soft)] last:border-b-0 ${idx % 2 === 0 ? ROW_COLORS[column] || "bg-[var(--paper)]" : "bg-[var(--paper)]"}`}
              >
                <td
                  className={`sticky left-0 z-10 w-40 min-w-[160px] border-l-[3px] border-r border-[var(--line-soft)] bg-inherit p-4 align-top text-sm font-semibold text-[var(--ink)] ${ROW_BORDER_COLORS[column] || "border-l-border"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${indicatorColor}`} title={indicatorLabel} />
                    <span>{COLUMN_LABELS[column] || column}</span>
                  </div>
                </td>
                {papers.map((paper) => (
                  <td
                    key={`${paper.paper_id}-${column}`}
                    className="border-r border-[var(--line-soft)] p-4 align-top last:border-r-0"
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
