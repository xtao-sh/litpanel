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
import { useI18n } from "@/lib/i18n/locale-context";

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
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {t("dashboard.gapAnalysis.title")}
          </CardTitle>
          <Link
            href="/maps/frontier_gaps"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#2c4870] hover:text-[#223a5e] transition-colors"
          >
            {t("dashboard.gapAnalysis.frontierGaps")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-[var(--ink-4)]">
          {t("dashboard.gapAnalysis.body")}
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
                <h3 className="text-sm font-semibold text-[var(--ink-3)] mb-2">
                  {t("dashboard.gapAnalysis.bridgeAtoms")}
                  <span className="ml-1 text-xs font-normal text-[var(--ink-5)]">
                    ({t("dashboard.gapAnalysis.connectingFields")})
                  </span>
                </h3>
                <TooltipProvider delayDuration={200}>
                  <div className="flex flex-wrap gap-2.5">
                    {data.bridgeAtoms.map((atom) => (
                      <Tooltip key={atom.slug}>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/atom/${atom.slug}`}
                            className="group inline-flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.03] hover:shadow-[var(--shadow-2)] "
                          >
                            <Badge variant={getAtomBadgeVariant(atom.type)} className="cursor-pointer">
                              {atom.title}
                              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--paper)]/70 px-1.5 py-0 text-xs font-bold leading-4">
                                {atom.fieldCount}
                              </span>
                            </Badge>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-64">
                          <p className="text-xs font-medium mb-1">
                            {t("dashboard.gapAnalysis.connects", {
                              fieldCount: atom.fieldCount,
                              paperCount: atom.paperCount,
                            })}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {atom.connectedFields.map((f) => (
                              <span
                                key={f}
                                className="inline-block rounded bg-[#e9eef6] px-1.5 py-0.5 text-xs text-[#223a5e]"
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
                <h3 className="text-sm font-semibold text-[var(--ink-3)] mb-2">
                  {t("dashboard.gapAnalysis.weakPairs")}
                </h3>
                <div className="overflow-hidden rounded-[var(--r)] border border-[var(--line-soft)]">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--paper-2)]/50 text-left text-xs font-medium uppercase tracking-wide text-[var(--ink-4)]">
                        <th className="px-3 py-2.5">{t("dashboard.gapAnalysis.fieldA")}</th>
                        <th className="px-3 py-2.5">{t("dashboard.gapAnalysis.fieldB")}</th>
                        <th className="px-3 py-2.5 text-right">{t("dashboard.gapAnalysis.sharedAtoms")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line-soft)]">
                      {data.weakConnections.map((wc) => (
                        <tr
                          key={`${wc.fieldA}-${wc.fieldB}`}
                          className="hover:bg-[var(--paper-2)] transition-colors"
                        >
                          <td className="px-3 py-2 text-[var(--ink)]">{wc.fieldA}</td>
                          <td className="px-3 py-2 text-[var(--ink)]">{wc.fieldB}</td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                wc.sharedAtomCount === 0
                                  ? "bg-[#f4dfd5] text-[#8a3318]"
                                  : wc.sharedAtomCount <= 2
                                    ? "bg-[#f4ead8] text-[#7a5a18]"
                                    : "bg-[var(--forest-soft)] text-[var(--forest-2)]"
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
            <div className="flex items-center gap-3 rounded-[var(--r)] bg-[var(--paper-2)]/60 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4ead8]">
                <Unlink className="h-4 w-4 text-[#7a5a18]" />
              </div>
              <p className="text-sm text-[var(--ink)]">
                {t("dashboard.gapAnalysis.orphanAtoms", { count: data.totalOrphanAtoms.toLocaleString() })}
                <span className="ml-1 text-xs text-[var(--ink-4)]">
                  ({t("dashboard.gapAnalysis.expansionPoints")})
                </span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
