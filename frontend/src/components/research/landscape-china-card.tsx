"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChinaHighlight } from "@/lib/types";

interface LandscapeChinaCardProps {
  chinaApplicability: {
    highCount: number;
    moderateCount: number;
    lowCount: number;
    highlights: ChinaHighlight[];
  };
}

export function LandscapeChinaCard({ chinaApplicability }: LandscapeChinaCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { highCount, moderateCount, lowCount, highlights } = chinaApplicability;
  const total = highCount + moderateCount + lowCount;

  if (total === 0) return null;

  return (
    <Card className="rounded-[var(--r)] shadow-[var(--shadow-1)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4 text-[var(--rust)]" />
          China Applicability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary bar */}
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--forest-soft)] px-2 py-0.5 font-medium text-[var(--forest-2)]">
            {highCount} highly applicable
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#f4ead8] px-2 py-0.5 font-medium text-[#7a5a18]">
            {moderateCount} moderate
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--paper-2)] px-2 py-0.5 font-medium text-[var(--ink-3)]">
            {lowCount} limited
          </span>
        </div>

        {/* Expand toggle */}
        {highlights.length > 0 && (
          <>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-[var(--ink-4)] hover:text-[var(--ink)]"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expanded && "rotate-180"
                )}
              />
              {expanded ? "Hide" : "Show"} highlights ({highlights.length})
            </button>

            {expanded && (
              <div className="space-y-2">
                {highlights.map((h) => (
                  <div
                    key={h.paperId}
                    className="rounded-[var(--r)] border border-[var(--line-soft)]/50 bg-[var(--paper-2)] px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                          h.applicabilityLevel === "high"
                            ? "bg-[var(--forest-soft)] text-[var(--forest-2)]"
                            : h.applicabilityLevel === "moderate"
                              ? "bg-[#f4ead8] text-[#7a5a18]"
                              : "bg-[var(--paper-2)] text-[var(--ink-3)]"
                        )}
                      >
                        {h.applicabilityLevel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/paper/${h.paperId}`}
                          className="text-sm font-medium text-[var(--ink)] hover:text-[var(--forest)] hover:underline"
                        >
                          {h.paperTitle}
                        </Link>
                        <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-[var(--ink-4)]">
                          {h.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
