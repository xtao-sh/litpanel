"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AtomPaper } from "@/lib/types";

interface PaperListProps {
  papers: AtomPaper[];
  getPaperHref?: (paperId: string) => string;
}

export function PaperList({ papers, getPaperHref }: PaperListProps) {
  const sorted = [...papers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No connected papers found.</p>
    );
  }

  return (
    <div className="paper-panel overflow-x-auto rounded-[1.25rem] border border-border/75">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/75 bg-[color:oklch(var(--accent)/0.22)] text-left text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <th className="px-4 py-3 pr-4">Paper ID</th>
            <th className="px-4 py-3 pr-4">Title</th>
            <th className="px-4 py-3 pr-4">Year</th>
            <th className="px-4 py-3 pr-4">Score</th>
            <th className="px-4 py-3">Fields</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((paper) => (
            <tr key={paper.paperId} className="hover:bg-[color:oklch(var(--accent)/0.32)]">
              <td className="px-4 py-3 pr-4">
                <Link
                  href={getPaperHref ? getPaperHref(paper.paperId) : `/paper/${paper.paperId}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {paper.paperId}
                </Link>
              </td>
              <td className="px-4 py-3 pr-4 max-w-md">
                <Link
                  href={getPaperHref ? getPaperHref(paper.paperId) : `/paper/${paper.paperId}`}
                  className="text-foreground hover:text-primary hover:underline"
                >
                  {paper.title || "Untitled"}
                </Link>
              </td>
              <td className="px-4 py-3 pr-4 text-muted-foreground tabular-nums">
                {paper.year ?? "--"}
              </td>
              <td className="px-4 py-3 pr-4 tabular-nums">
                {paper.averageScore != null ? (
                  <span className="font-medium text-foreground">
                    {paper.averageScore.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {paper.fields?.map((field) => (
                    <Badge
                      key={field}
                      variant="outline"
                      className="text-[10px] font-normal"
                    >
                      {field}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
