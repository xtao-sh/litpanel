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
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", dot: "bg-cyan-500" },
  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", dot: "bg-teal-500" },
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
        <Layers className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Need at least 4 papers to cluster.
        </p>
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
            className="rounded-xl border border-border p-4 space-y-2"
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
        <p className="text-sm text-muted-foreground">
          Could not cluster papers. Try a broader search.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {clusters.length} cluster{clusters.length !== 1 ? "s" : ""} across{" "}
          {allPaperIds.length} papers
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
                "rounded-xl border transition-colors",
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
                    "flex-1 text-sm font-medium leading-snug",
                    color.text
                  )}
                >
                  {cluster.label}
                </span>
                <span className={cn("text-[10px] font-medium", color.text)}>
                  {cluster.paperCount} paper
                  {cluster.paperCount !== 1 ? "s" : ""}
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
                          className="cursor-pointer text-[9px] hover:opacity-80"
                        >
                          {atom.title.length > 25
                            ? atom.title.slice(0, 23) + ".."
                            : atom.title}
                        </Badge>
                      </Link>
                      {getAtomExplorerHref && (
                        <Link
                          href={getAtomExplorerHref(atom.slug)}
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground"
                          title="Open this cluster atom in Explorer"
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
                <div className="border-t border-border/30">
                  {cluster.papers.map((paper) => (
                    <div
                      key={paper.paperId}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/60",
                        selectedPaperId === paper.paperId && "bg-white/80",
                        showCompare && compareIds.has(paper.paperId) && "bg-blue-50/70"
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
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {paperClickMode === "detail" && getPaperDetailHref ? (
                          <Link
                            href={getPaperDetailHref(paper.paperId)}
                            className="block line-clamp-1 text-xs font-medium text-foreground hover:text-primary"
                          >
                            {paper.title ?? "Untitled"}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="block text-left text-xs font-medium text-foreground hover:text-primary"
                            onClick={() => onSelectPaper(paper.paperId)}
                          >
                            {paper.title ?? "Untitled"}
                          </button>
                        )}
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
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
                                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                              >
                                Detail
                              </Link>
                            )}
                            {getPaperExplorerHref && (
                              <Link
                                href={getPaperExplorerHref(paper.paperId)}
                                className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                              >
                                <Search className="h-3 w-3" />
                                Explorer
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-0.5">
                        {paper.hasCard && (
                          <FileText className="h-3 w-3 shrink-0 text-blue-400" />
                        )}
                        {paper.averageScore != null && (
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-medium tabular-nums",
                              paper.averageScore >= 4
                                ? "text-green-600"
                                : paper.averageScore >= 3
                                  ? "text-yellow-600"
                                  : "text-gray-400"
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
