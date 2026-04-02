"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Cog, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandscapeAtom } from "@/lib/types";

interface LandscapeMechanismsCardProps {
  mechanisms: LandscapeAtom[];
  onAtomClick: (slug: string) => void;
  getExplorerHref?: (slug: string) => string;
  actionMode?: "compact" | "buttons";
}

export function LandscapeMechanismsCard({
  mechanisms,
  onAtomClick,
  getExplorerHref,
  actionMode = "compact",
}: LandscapeMechanismsCardProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const sorted = [...mechanisms].sort((a, b) => b.paperCount - a.paperCount);

  if (sorted.length === 0) return null;

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Cog className="h-4 w-4 text-orange-500" />
          Mechanisms studied
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((mechanism) => (
          <div key={mechanism.slug} className="rounded-lg transition-colors hover:bg-accent/40">
            <div className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
                  onClick={() => onAtomClick(mechanism.slug)}
                >
                  {mechanism.title}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(mechanism.slug)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Detail
                    </button>
                    <Link
                      href={
                        getExplorerHref
                          ? getExplorerHref(mechanism.slug)
                          : `/explorer?tab=papers&atomSlug=${encodeURIComponent(mechanism.slug)}`
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-700 transition-colors hover:bg-orange-100"
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
                      ? getExplorerHref(mechanism.slug)
                      : `/explorer?tab=papers&atomSlug=${encodeURIComponent(mechanism.slug)}`
                  }
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-orange-600"
                  title="Filter papers by this mechanism in Explorer"
                >
                  <Filter className="h-3 w-3" />
                </Link>
              )}
              <Badge variant="mechanism" className="shrink-0 text-[10px]">
                {mechanism.paperCount} paper{mechanism.paperCount !== 1 ? "s" : ""}
              </Badge>
              {mechanism.description && (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setExpandedSlug(expandedSlug === mechanism.slug ? null : mechanism.slug)
                  }
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      expandedSlug === mechanism.slug && "rotate-180"
                    )}
                  />
                </button>
              )}
            </div>
            {expandedSlug === mechanism.slug && mechanism.description && (
              <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">
                {mechanism.description}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
