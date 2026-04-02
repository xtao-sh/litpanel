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
      <p className="text-sm text-gray-500">No connected papers found.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="pb-3 pr-4">Paper ID</th>
            <th className="pb-3 pr-4">Title</th>
            <th className="pb-3 pr-4">Year</th>
            <th className="pb-3 pr-4">Score</th>
            <th className="pb-3">Fields</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((paper) => (
            <tr key={paper.paperId} className="hover:bg-gray-50">
              <td className="py-3 pr-4">
                <Link
                  href={getPaperHref ? getPaperHref(paper.paperId) : `/paper/${paper.paperId}`}
                  className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {paper.paperId}
                </Link>
              </td>
              <td className="py-3 pr-4 max-w-md">
                <Link
                  href={getPaperHref ? getPaperHref(paper.paperId) : `/paper/${paper.paperId}`}
                  className="text-gray-900 hover:text-blue-600 hover:underline"
                >
                  {paper.title || "Untitled"}
                </Link>
              </td>
              <td className="py-3 pr-4 text-gray-600 tabular-nums">
                {paper.year ?? "--"}
              </td>
              <td className="py-3 pr-4 tabular-nums">
                {paper.averageScore != null ? (
                  <span className="font-medium text-gray-900">
                    {paper.averageScore.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </td>
              <td className="py-3">
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
