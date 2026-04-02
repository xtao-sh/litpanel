"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useLazyQuery } from "@apollo/client/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical,
  Search,
  ChevronDown,
  ExternalLink,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ADVISE_METHODS } from "@/lib/queries";
import type { MethodAdvice } from "@/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MethodAdvisorProps {
  /** Pre-fill the description (e.g., from the research search query). */
  initialQuery?: string;
  /** Whether to show as a compact inline panel vs full card. */
  compact?: boolean;
  /** Called when user wants to close the advisor. */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Query result type
// ---------------------------------------------------------------------------

interface AdviseMethodsResult {
  adviseMethods: MethodAdvice[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MethodAdvisor({
  initialQuery = "",
  compact = false,
  onClose,
}: MethodAdvisorProps) {
  const [description, setDescription] = useState(initialQuery);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const [fetchMethods, { data, loading, called }] =
    useLazyQuery<AdviseMethodsResult>(ADVISE_METHODS);

  const methods = data?.adviseMethods ?? [];

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!description.trim()) return;
      fetchMethods({ variables: { description: description.trim(), limit: 10 } });
    },
    [description, fetchMethods]
  );

  // ---- Relevance bar ----
  const RelevanceBar = ({ score }: { score: number }) => {
    const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct >= 70
                ? "bg-emerald-500"
                : pct >= 50
                  ? "bg-yellow-500"
                  : "bg-gray-400"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
    );
  };

  return (
    <Card className={cn("rounded-xl shadow-sm", compact && "border-0 shadow-none")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FlaskConical className="h-4 w-4 text-emerald-500" />
            Method Advisor
          </CardTitle>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Describe your research setup to find the best methods.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., I have panel data on Chinese hospitals with staggered policy adoption across provinces..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading || !description.trim()}
            className="shrink-0 self-end gap-1"
          >
            <Search className="h-3.5 w-3.5" />
            Find
          </Button>
        </form>

        {/* Loading state */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border/50 p-3"
              >
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && called && methods.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No methods found. Try a different description.
          </p>
        )}

        {!loading && methods.length > 0 && (
          <div className="space-y-1">
            {methods.map((method) => (
              <div
                key={method.slug}
                className="rounded-lg border border-border/50 transition-colors hover:bg-accent/30"
              >
                {/* Header row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <Link
                    href={`/atom/${method.slug}`}
                    className="flex-1 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {method.title}
                  </Link>
                  <RelevanceBar score={method.relevanceScore} />
                  {method.evidenceStrength && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                        method.evidenceStrength === "strong"
                          ? "bg-green-100 text-green-700"
                          : method.evidenceStrength === "moderate"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {method.evidenceStrength}
                    </span>
                  )}
                  <Badge variant="method" className="shrink-0 text-[10px]">
                    {method.paperCount} paper
                    {method.paperCount !== 1 ? "s" : ""}
                  </Badge>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setExpandedSlug(
                        expandedSlug === method.slug ? null : method.slug
                      )
                    }
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        expandedSlug === method.slug && "rotate-180"
                      )}
                    />
                  </button>
                </div>

                {/* Expanded details */}
                {expandedSlug === method.slug && (
                  <div className="space-y-2 border-t border-border/50 px-3 py-2">
                    {method.whenToUse && (
                      <div className="rounded-md bg-emerald-50 px-3 py-2">
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          When to use
                        </p>
                        <p className="text-xs leading-relaxed text-emerald-900">
                          {method.whenToUse}
                        </p>
                      </div>
                    )}
                    {method.description && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {method.description}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/atom/${method.slug}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        View method details
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
