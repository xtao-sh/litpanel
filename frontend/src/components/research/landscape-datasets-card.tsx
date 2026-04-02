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
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Database className="h-4 w-4 text-purple-500" />
          Datasets in this literature
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((dataset) => (
          <div key={dataset.slug} className="rounded-lg transition-colors hover:bg-accent/40">
            <div className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
                  onClick={() => onAtomClick(dataset.slug)}
                >
                  {dataset.title}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(dataset.slug)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Detail
                    </button>
                    <Link
                      href={
                        getExplorerHref
                          ? getExplorerHref(dataset.slug)
                          : `/explorer?tab=papers&atomSlug=${encodeURIComponent(dataset.slug)}`
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700 transition-colors hover:bg-purple-100"
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
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-purple-600"
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
                      ? "bg-green-100 text-green-700"
                      : dataset.access === "restricted"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"
                  )}
                >
                  {dataset.access}
                </span>
              )}
              {dataset.description && (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
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
              <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">
                {dataset.description}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
