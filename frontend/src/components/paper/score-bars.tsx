"use client";

import type { PaperScore } from "@/lib/types";

/** Dimension groupings for display ordering. */
const DIMENSION_GROUPS: Record<string, string[]> = {
  "Literature & Theory": [
    "literature_innovation",
    "theory_contribution",
    "hypothesis_clarity",
    "theoretical_framework",
  ],
  "Methods & Data": [
    "identification_strategy",
    "robustness",
    "data_quality",
    "statistical_rigor",
  ],
  "Writing & Presentation": [
    "writing_quality",
    "structure_logic",
    "tables_figures",
    "transparency",
  ],
  Relevance: [
    "policy_relevance",
    "china_applicability",
    "novelty",
  ],
};

function barGradient(score: number): string {
  if (score >= 4.5) return "bg-gradient-to-r from-[var(--forest-soft)] to-[var(--forest)]";
  if (score >= 3.5) return "bg-gradient-to-r from-[#dfe7f2] to-[#2c4870]";
  if (score >= 2.5) return "bg-gradient-to-r from-[#f4ead8] to-[#b88a3b]";
  return "bg-gradient-to-r from-[var(--paper-3)] to-[var(--ink-5)]";
}

function formatDimension(dim: string): string {
  return dim.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ScoreBarsProps {
  scores: PaperScore[];
}

export function ScoreBars({ scores }: ScoreBarsProps) {
  const scoreMap = new Map(scores.map((s) => [s.dimension, s.score]));

  // Build ordered list: grouped dimensions first, then any extras
  const rendered = new Set<string>();
  const groups: { label: string; items: { dim: string; score: number }[] }[] =
    [];

  for (const [groupLabel, dims] of Object.entries(DIMENSION_GROUPS)) {
    const items: { dim: string; score: number }[] = [];
    for (const dim of dims) {
      const score = scoreMap.get(dim);
      if (score !== undefined) {
        items.push({ dim, score });
        rendered.add(dim);
      }
    }
    if (items.length > 0) {
      groups.push({ label: groupLabel, items });
    }
  }

  // Remaining ungrouped dimensions
  const extras: { dim: string; score: number }[] = [];
  for (const s of scores) {
    if (!rendered.has(s.dimension)) {
      extras.push({ dim: s.dimension, score: s.score });
    }
  }
  if (extras.length > 0) {
    groups.push({ label: "Other", items: extras });
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-5)]">No scores available</p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
            {group.label}
          </h4>
          <div className="space-y-1.5">
            {group.items.map(({ dim, score }) => (
              <div key={dim} className="flex items-center gap-2">
                <span className="w-36 shrink-0 truncate text-xs text-[var(--ink-3)]">
                  {formatDimension(dim)}
                </span>
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-2)]">
                  <div
                    className={`h-full rounded-full transition-all ${barGradient(score)}`}
                    style={{ width: `${(score / 5) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-sm text-[var(--ink-3)]">
                  {score}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
