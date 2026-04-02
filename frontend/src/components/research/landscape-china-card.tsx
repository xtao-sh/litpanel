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
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4 text-red-500" />
          China Applicability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary bar */}
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
            {highCount} highly applicable
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-yellow-700">
            {moderateCount} moderate
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
            {lowCount} limited
          </span>
        </div>

        {/* Expand toggle */}
        {highlights.length > 0 && (
          <>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
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
                    className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                          h.applicabilityLevel === "high"
                            ? "bg-green-100 text-green-700"
                            : h.applicabilityLevel === "moderate"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {h.applicabilityLevel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/paper/${h.paperId}`}
                          className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {h.paperTitle}
                        </Link>
                        <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
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
