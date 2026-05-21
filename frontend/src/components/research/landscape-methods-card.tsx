"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Filter, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandscapeAtom } from "@/lib/types";

interface LandscapeMethodsCardProps {
  methods: LandscapeAtom[];
  onAtomClick: (slug: string) => void;
  getExplorerHref?: (slug: string) => string;
  actionMode?: "compact" | "buttons";
}

export function LandscapeMethodsCard({
  methods,
  onAtomClick,
  getExplorerHref,
  actionMode = "compact",
}: LandscapeMethodsCardProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const sorted = [...methods].sort((a, b) => b.paperCount - a.paperCount);

  if (sorted.length === 0) return null;

  return (
    <Card className="rounded-[var(--r)] shadow-[var(--shadow-1)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <FlaskConical className="h-4 w-4 text-[var(--forest)]" />
          Methods in this literature
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((method) => (
          <div key={method.slug} className="rounded-[var(--r)] transition-colors hover:bg-[var(--paper-2)]">
            <div className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--forest)]"
                  onClick={() => onAtomClick(method.slug)}
                >
                  {method.title}
                </button>
                {actionMode === "buttons" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAtomClick(method.slug)}
                      className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-2 py-1 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
                    >
                      Detail
                    </button>
                    <Link
                      href={
                        getExplorerHref
                          ? getExplorerHref(method.slug)
                          : `/explorer?tab=papers&atomSlug=${encodeURIComponent(method.slug)}`
                      }
                      className="inline-flex items-center gap-1 rounded-[var(--r)] border border-[var(--forest)] bg-[var(--forest-soft)] px-2 py-1 text-[11px] font-medium text-[var(--forest-2)] transition-colors hover:bg-[var(--forest-soft)]"
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
                      ? getExplorerHref(method.slug)
                      : `/explorer?tab=papers&atomSlug=${encodeURIComponent(method.slug)}`
                  }
                  className="shrink-0 rounded p-0.5 text-[var(--ink-4)] transition-colors hover:text-[var(--forest)]"
                  title="Filter papers by this method in Explorer"
                >
                  <Filter className="h-3 w-3" />
                </Link>
              )}
              <Badge variant="method" className="shrink-0 text-[10px]">
                {method.paperCount} paper{method.paperCount !== 1 ? "s" : ""}
              </Badge>
              {method.evidenceStrength && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                    method.evidenceStrength === "strong"
                      ? "bg-[var(--forest-soft)] text-[var(--forest-2)]"
                      : method.evidenceStrength === "moderate"
                        ? "bg-[#f4ead8] text-[#7a5a18]"
                        : "bg-[var(--paper-2)] text-[var(--ink-3)]"
                  )}
                >
                  {method.evidenceStrength}
                </span>
              )}
              {method.description && (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-[var(--ink-4)] hover:text-[var(--ink)]"
                  onClick={() =>
                    setExpandedSlug(expandedSlug === method.slug ? null : method.slug)
                  }
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      expandedSlug === method.slug && "rotate-180"
                    )}
                  />
                </button>
              )}
            </div>
            {expandedSlug === method.slug && method.description && (
              <p className="px-2 pb-2 text-xs leading-relaxed text-[var(--ink-4)]">
                {method.description}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
