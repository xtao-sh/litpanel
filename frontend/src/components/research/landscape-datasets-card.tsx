"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Database, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandscapeAtom } from "@/lib/types";

interface LandscapeDatasetsCardProps {
  datasets: LandscapeAtom[];
  onAtomClick: (slug: string) => void;
  getExplorerHref?: (slug: string) => string;
  actionMode?: "compact" | "buttons";
}

export function LandscapeDatasetsCard({
  datasets,
  onAtomClick,
  getExplorerHref,
  actionMode = "compact",
}: LandscapeDatasetsCardProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const sorted = [...datasets].sort((a, b) => b.paperCount - a.paperCount);

  if (sorted.length === 0) return null;

  return (
    <Card className="rounded-[var(--r)] shadow-[var(--shadow-1)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Database className="h-4 w-4 text-[#2c4870]" />
          Datasets in this literature
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((dataset) => (
          <div key={dataset.slug} className="rounded-[var(--r)] transition-colors hover:bg-[var(--paper-2)]">
            <div className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--forest)]"
                  onClick={() => onAtomClick(dataset.slug)}
                >
                  {dataset.title}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(dataset.slug)}
                      className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-2 py-1 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
                    >
                      Detail
                    </button>
                    <Link
                      href={
                        getExplorerHref
                          ? getExplorerHref(dataset.slug)
                          : `/explorer?tab=papers&atomSlug=${encodeURIComponent(dataset.slug)}`
                      }
                      className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] px-2 py-1 text-[11px] font-medium text-[#223a5e] transition-colors hover:bg-[#e9eef6]"
                    >
                      <Filter className="h-3 w-3" />
                      Explorer
                    </Link>
                  </div>
                )}
              </div>
              {actionMode === "compact" && (
                <Link
                  href={
                    getExplorerHref
                      ? getExplorerHref(dataset.slug)
                      : `/explorer?tab=papers&atomSlug=${encodeURIComponent(dataset.slug)}`
                  }
                  className="shrink-0 rounded p-0.5 text-[var(--ink-4)] transition-colors hover:text-[#2c4870]"
                  title="Filter papers by this dataset in Explorer"
                >
                  <Filter className="h-3 w-3" />
                </Link>
              )}
              <Badge variant="dataset" className="shrink-0 text-[10px]">
                {dataset.paperCount} paper{dataset.paperCount !== 1 ? "s" : ""}
              </Badge>
              {dataset.access && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                    dataset.access === "public"
                      ? "bg-[var(--forest-soft)] text-[var(--forest-2)]"
                      : dataset.access === "restricted"
                        ? "bg-[#f4ead8] text-[#7a5a18]"
                        : "bg-[var(--paper-2)] text-[var(--ink-3)]"
                  )}
                >
                  {dataset.access}
                </span>
              )}
              {dataset.description && (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-[var(--ink-4)] hover:text-[var(--ink)]"
                  onClick={() =>
                    setExpandedSlug(expandedSlug === dataset.slug ? null : dataset.slug)
                  }
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      expandedSlug === dataset.slug && "rotate-180"
                    )}
                  />
                </button>
              )}
            </div>
            {expandedSlug === dataset.slug && dataset.description && (
              <p className="px-2 pb-2 text-xs leading-relaxed text-[var(--ink-4)]">
                {dataset.description}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
