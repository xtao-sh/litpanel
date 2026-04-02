"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowRight, Unlink } from "lucide-react";
import type { GapAnalysis } from "@/lib/types";

interface GapAnalysisCardProps {
  data: GapAnalysis | undefined;
  loading: boolean;
}

const atomTypeBadgeVariant: Record<string, "mechanism" | "method" | "dataset" | "puzzle" | "secondary"> = {
  mechanism: "mechanism",
  method: "method",
  dataset: "dataset",
  puzzle: "puzzle",
};

function getAtomBadgeVariant(type: string) {
  return atomTypeBadgeVariant[type] || "secondary";
}

export function GapAnalysisCard({ data, loading }: GapAnalysisCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Research Gaps &amp; Bridges
          </CardTitle>
          <Link
            href="/maps/frontier_gaps"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Frontier Gaps
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Corpus-wide structural signal based on atom links between papers and fields, not just deep-read cards.
        </p>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <div className="space-y-6">
            {/* Bridge atoms skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-28 rounded-full" />
                ))}
              </div>
            </div>
            {/* Weak connections skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bridge Atoms */}
            {data.bridgeAtoms.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Bridge Atoms
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    (connecting 3+ fields)
                  </span>
                </h3>
                <TooltipProvider delayDuration={200}>
                  <div className="flex flex-wrap gap-2.5">
                    {data.bridgeAtoms.map((atom) => (
                      <Tooltip key={atom.slug}>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/atom/${atom.slug}`}
                            className="group inline-flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.03] hover:shadow-md hover:shadow-primary/10"
                          >
                            <Badge variant={getAtomBadgeVariant(atom.type)} className="cursor-pointer">
                              {atom.title}
                              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/70 px-1.5 py-0 text-xs font-bold leading-4">
                                {atom.fieldCount}
                              </span>
                            </Badge>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64">
                          <p className="text-xs font-medium mb-1">
                            Connects {atom.fieldCount} fields across {atom.paperCount} papers
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {atom.connectedFields.map((f) => (
                              <span
                                key={f}
                                className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
            )}

            {/* Weak Field Connections */}
            {data.weakConnections.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Underconnected Field Pairs
                </h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2.5">Field A</th>
                        <th className="px-3 py-2.5">Field B</th>
                        <th className="px-3 py-2.5 text-right">Shared Atoms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.weakConnections.map((wc) => (
                        <tr
                          key={`${wc.fieldA}-${wc.fieldB}`}
                          className="hover:bg-accent/50 transition-colors"
                        >
                          <td className="px-3 py-2 text-foreground">{wc.fieldA}</td>
                          <td className="px-3 py-2 text-foreground">{wc.fieldB}</td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                wc.sharedAtomCount === 0
                                  ? "bg-red-100 text-red-700"
                                  : wc.sharedAtomCount <= 2
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-green-100 text-green-700"
                              }`}
                            >
                              {wc.sharedAtomCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Orphan atom count */}
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <Unlink className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-sm text-foreground">
                <span className="font-semibold">
                  {data.totalOrphanAtoms.toLocaleString()}
                </span>{" "}
                atoms connected to only 1 paper
                <span className="ml-1 text-xs text-muted-foreground">
                  (potential expansion points)
                </span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
