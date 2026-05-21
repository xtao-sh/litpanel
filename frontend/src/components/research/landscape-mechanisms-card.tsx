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
    <Card className="rounded-[var(--r)] shadow-[var(--shadow-1)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Cog className="h-4 w-4 text-[#8a6d3b]" />
          Mechanisms studied
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((mechanism) => (
          <div key={mechanism.slug} className="rounded-[var(--r)] transition-colors hover:bg-[var(--paper-2)]">
            <div className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--forest)]"
                  onClick={() => onAtomClick(mechanism.slug)}
                >
                  {mechanism.title}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(mechanism.slug)}
                      className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-2 py-1 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
                    >
                      Detail
                    </button>
                    <Link
                      href={
                        getExplorerHref
                          ? getExplorerHref(mechanism.slug)
                          : `/explorer?tab=papers&atomSlug=${encodeURIComponent(mechanism.slug)}`
                      }
                      className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[#d6b678] bg-[#f4ead8] px-2 py-1 text-[11px] font-medium text-[#7a5a18] transition-colors hover:bg-[#f4ead8]"
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
                  className="shrink-0 rounded p-0.5 text-[var(--ink-4)] transition-colors hover:text-[#7a5a18]"
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
                  className="shrink-0 rounded p-0.5 text-[var(--ink-4)] hover:text-[var(--ink)]"
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
              <p className="px-2 pb-2 text-xs leading-relaxed text-[var(--ink-4)]">
                {mechanism.description}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
