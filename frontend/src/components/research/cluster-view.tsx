"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, FileText, Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLUSTER_PAPERS } from "@/lib/queries";
import type { PaperCluster } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClusterViewProps {
  allPaperIds: string[];
  onSelectPaper: (paperId: string) => void;
  selectedPaperId: string | null;
  compareIds?: Set<string>;
  onToggleCompare?: (paperId: string, e: React.MouseEvent) => void;
  showCompare?: boolean;
  getAtomHref?: (slug: string) => string;
  getAtomExplorerHref?: (slug: string) => string;
  getPaperDetailHref?: (paperId: string) => string;
  getPaperExplorerHref?: (paperId: string) => string;
  paperClickMode?: "select" | "detail";
}

// ---------------------------------------------------------------------------
// Query result type
// ---------------------------------------------------------------------------

interface ClusterPapersResult {
  clusterPapers: PaperCluster[];
}

// ---------------------------------------------------------------------------
// Cluster colors
// ---------------------------------------------------------------------------

const CLUSTER_COLORS = [
  { bg: "bg-[#e9eef6]", border: "border-[#bccbe0]", text: "text-[#223a5e]", dot: "bg-[#2c4870]" },
  { bg: "bg-[var(--forest-soft)]", border: "border-[var(--forest)]", text: "text-[var(--forest-2)]", dot: "bg-[var(--forest)]" },
  { bg: "bg-[#e9eef6]", border: "border-[#bccbe0]", text: "text-[#223a5e]", dot: "bg-[#2c4870]" },
  { bg: "bg-[#f4ead8]", border: "border-[#d6b678]", text: "text-[#7a5a18]", dot: "bg-[#b88a3b]" },
  { bg: "bg-[#f4dfd5]", border: "border-[#da9a80]", text: "text-[#8a3318]", dot: "bg-[var(--rust)]" },
  { bg: "bg-[#e9eef6]", border: "border-[#bccbe0]", text: "text-[#223a5e]", dot: "bg-[#2c4870]" },
  { bg: "bg-[#e9eef6]", border: "border-[#bccbe0]", text: "text-[#223a5e]", dot: "bg-[#2c4870]" },
  { bg: "bg-[var(--forest-soft)]", border: "border-[var(--forest)]", text: "text-[var(--forest-2)]", dot: "bg-[var(--forest)]" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClusterView({
  allPaperIds,
  onSelectPaper,
  selectedPaperId,
  compareIds = new Set<string>(),
  onToggleCompare,
  showCompare = true,
  getAtomHref,
  getAtomExplorerHref,
  getPaperDetailHref,
  getPaperExplorerHref,
  paperClickMode = "select",
}: ClusterViewProps) {
  const { t } = useI18n();
  const [collapsedClusters, setCollapsedClusters] = useState<Set<number>>(
    new Set()
  );

  const { data, loading } = useQuery<ClusterPapersResult>(CLUSTER_PAPERS, {
    variables: { paperIds: allPaperIds },
    skip: allPaperIds.length < 4,
  });

  const clusters = data?.clusterPapers ?? [];

  const toggleCluster = (clusterId: number) => {
    setCollapsedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  // Too few papers
  if (allPaperIds.length < 4) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
        <div className="lp-card rounded-[var(--r-md)] px-5 py-4">
          <Layers className="mx-auto mb-2 h-6 w-6 text-[var(--forest)]" />
          <p className="section-kicker">{t("research.cluster.kicker")}</p>
          <p className="mt-2 text-sm text-[var(--ink-4)]">
            {t("research.cluster.tooFew")}
          </p>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex h-full flex-col space-y-3 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="lp-card space-y-2 rounded-[var(--r-md)] p-4"
          >
            <Skeleton className="h-5 w-48" />
            <div className="space-y-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
        <div className="lp-card rounded-[var(--r-md)] px-5 py-4">
          <p className="section-kicker">{t("research.cluster.kicker")}</p>
          <p className="mt-2 text-sm text-[var(--ink-4)]">
            {t("research.cluster.empty")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary bar */}
      <div className="lp-card mx-2 mb-2 flex items-center gap-2 rounded-[var(--r-md)] px-3 py-2">
        <Layers className="h-3.5 w-3.5 text-[var(--forest)]" />
        <span className="text-xs text-[var(--ink-4)]">
          {t("research.cluster.summary", {
            clusters: clusters.length,
            papers: allPaperIds.length,
          })}
        </span>
      </div>

      {/* Clusters */}
      <div className="flex-1 overflow-y-auto space-y-2 p-2">
        {clusters.map((cluster) => {
          const color =
            CLUSTER_COLORS[cluster.clusterId % CLUSTER_COLORS.length];
          const isCollapsed = collapsedClusters.has(cluster.clusterId);

          return (
            <div
              key={cluster.clusterId}
              className={cn(
                "lp-card rounded-[var(--r-md)] transition-colors",
                color.border,
                color.bg
              )}
            >
              {/* Cluster header */}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                onClick={() => toggleCluster(cluster.clusterId)}
              >
                <div
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color.dot)}
                />
                <span
                  className={cn(
                    "font-display flex-1 text-[1.2rem] leading-snug",
                    color.text
                  )}
                >
                  {cluster.label}
                </span>
                <span className={cn("text-[10px] font-medium", color.text)}>
                  {t(cluster.paperCount === 1 ? "research.cluster.paperCount" : "research.cluster.paperCountPlural", {
                    count: cluster.paperCount,
                  })}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    color.text,
                    isCollapsed && "-rotate-90"
                  )}
                />
              </button>

              {/* Atom badges */}
              {!isCollapsed && cluster.topAtoms.length > 0 && (
                <div className="flex flex-wrap gap-1 px-3 pb-1.5">
                  {cluster.topAtoms.map((atom) => (
                    <div key={atom.slug} className="inline-flex items-center gap-1">
                      <Link
                        href={getAtomHref ? getAtomHref(atom.slug) : `/atom/${atom.slug}`}
                        className="inline-flex"
                      >
                        <Badge
                          variant={
                            atom.type === "method"
                              ? "method"
                              : atom.type === "dataset"
                                ? "dataset"
                                : atom.type === "mechanism"
                                  ? "mechanism"
                                  : "outline"
                          }
                          className="cursor-pointer rounded-full text-[9px] hover:opacity-80"
                        >
                          {atom.title.length > 25
                            ? atom.title.slice(0, 23) + ".."
                            : atom.title}
                        </Badge>
                      </Link>
                      {getAtomExplorerHref && (
                        <Link
                          href={getAtomExplorerHref(atom.slug)}
                          className="rounded-full p-0.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                          title={t("research.cluster.openAtomExplorer")}
                        >
                          <Search className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Papers list */}
              {!isCollapsed && (
                <div className="border-t border-[var(--line-soft)]/30">
                  {cluster.papers.map((paper) => (
                    <div
                      key={paper.paperId}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--paper)]/60",
                        selectedPaperId === paper.paperId && "bg-[var(--paper)]",
                        showCompare && compareIds.has(paper.paperId) && "bg-[var(--paper-3)]"
                      )}
                    >
                      {showCompare && onToggleCompare && (
                        <div
                          className="flex shrink-0 items-start pt-0.5"
                          onClick={(e) => onToggleCompare(paper.paperId, e)}
                        >
                          <input
                            type="checkbox"
                            checked={compareIds.has(paper.paperId)}
                            readOnly
                            className="h-3.5 w-3.5 rounded border-[var(--line)] text-[#2c4870] focus:ring-[var(--forest)] cursor-pointer"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {paperClickMode === "detail" && getPaperDetailHref ? (
                          <Link
                            href={getPaperDetailHref(paper.paperId)}
                            className="font-display block line-clamp-1 text-[1rem] text-[var(--ink)] hover:text-[var(--forest)]"
                          >
                            {paper.title ?? t("research.cluster.untitled")}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="font-display block text-left text-[1rem] text-[var(--ink)] hover:text-[var(--forest)]"
                            onClick={() => onSelectPaper(paper.paperId)}
                          >
                            {paper.title ?? t("research.cluster.untitled")}
                          </button>
                        )}
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--ink-4)]">
                          {paper.year && (
                            <span className="tabular-nums">{paper.year}</span>
                          )}
                          {paper.fields.slice(0, 2).map((f) => (
                            <span key={f} className="truncate">
                              {f}
                            </span>
                          ))}
                        </div>
                        {(getPaperDetailHref || getPaperExplorerHref) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {getPaperDetailHref && (
                              <Link
                                href={getPaperDetailHref(paper.paperId)}
                                className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-2 py-1 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
                              >
                                {t("research.cluster.detail")}
                              </Link>
                            )}
                            {getPaperExplorerHref && (
                              <Link
                                href={getPaperExplorerHref(paper.paperId)}
                                className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] px-2 py-1 text-[11px] font-medium text-[#223a5e] transition-colors hover:bg-[#e9eef6]"
                              >
                                <Search className="h-3 w-3" />
                                {t("research.cluster.explorer")}
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-0.5">
                        {paper.hasCard && (
                          <FileText className="h-3 w-3 shrink-0 text-[#4e688d]" />
                        )}
                        {paper.averageScore != null && (
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-medium tabular-nums",
                              paper.averageScore >= 4
                                ? "text-[var(--forest)]"
                                : paper.averageScore >= 3
                                  ? "text-[#7a5a18]"
                                  : "text-[var(--ink-5)]"
                            )}
                          >
                            {paper.averageScore.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
