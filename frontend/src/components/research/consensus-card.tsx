"use client";

import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Scale, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import type { ConsensusResult, ConsensusItem } from "@/lib/types";
import { activeLibraryFetch, getApiUrl, withActiveLibraryHeaders } from "@/lib/api";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsensusCardProps {
  allPaperIds: string[];
  searchQuery: string;
}

// ---------------------------------------------------------------------------
// Stance badge colors
// ---------------------------------------------------------------------------

function stanceBadge(stance: string) {
  switch (stance) {
    case "SUPPORTS":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "CONTRADICTS":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function stanceLabel(stance: string) {
  switch (stance) {
    case "SUPPORTS":
      return "Supports";
    case "CONTRADICTS":
      return "Contradicts";
    default:
      return "Neutral";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsensusCard({ allPaperIds, searchQuery }: ConsensusCardProps) {
  const [result, setResult] = useState<ConsensusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const analyzeConsensus = useCallback(async () => {
    if (!searchQuery.trim() || allPaperIds.length === 0) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiBase = getApiUrl();
      const res = await activeLibraryFetch(`${apiBase}/api/analyze/consensus`, {
        method: "POST",
        headers: withActiveLibraryHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          query: searchQuery,
          paper_ids: allPaperIds.slice(0, 50),
        }),
      });

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const data = (await res.json()) as ConsensusResult;
      if (data.error) {
        setError(data.error);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, allPaperIds]);

  const total = result
    ? result.supports_count + result.contradicts_count + result.neutral_count
    : 0;

  const displayItems = result?.items ?? [];
  const visibleItems = showAll ? displayItems : displayItems.slice(0, 5);

  return (
    <Card className="paper-panel rounded-[1.45rem] border-border/75 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-primary/10">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="section-kicker">Synthesis</p>
            <CardTitle className="mt-2 font-display text-[1.45rem] text-foreground">
              Literature Consensus
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Trigger button or results */}
        {!result && !loading && (
          <div className="text-center">
            <p className="mb-3 text-xs text-muted-foreground">
              Analyze how the literature aligns on your research question using AI.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={analyzeConsensus}
              disabled={allPaperIds.length === 0 || !searchQuery.trim()}
              className="gap-1.5"
            >
              <Scale className="h-3.5 w-3.5" />
              Analyze Consensus
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              Classifying {Math.min(allPaperIds.length, 50)} papers...
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-[1rem] border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs text-rose-700">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={analyzeConsensus}
              className="mt-2 h-7 text-xs"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* Horizontal bar chart */}
            {total > 0 && (
              <div className="space-y-1.5">
                <div className="flex h-6 w-full overflow-hidden rounded-full">
                  {result.supports_count > 0 && (
                    <div
                      className="flex items-center justify-center bg-emerald-500 text-[10px] font-semibold text-white transition-all"
                      style={{
                        width: `${(result.supports_count / total) * 100}%`,
                      }}
                    >
                      {result.supports_count}
                    </div>
                  )}
                  {result.neutral_count > 0 && (
                    <div
                      className="flex items-center justify-center bg-muted-foreground/30 text-[10px] font-semibold text-foreground transition-all"
                      style={{
                        width: `${(result.neutral_count / total) * 100}%`,
                      }}
                    >
                      {result.neutral_count}
                    </div>
                  )}
                  {result.contradicts_count > 0 && (
                    <div
                      className="flex items-center justify-center bg-rose-500 text-[10px] font-semibold text-white transition-all"
                      style={{
                        width: `${(result.contradicts_count / total) * 100}%`,
                      }}
                    >
                      {result.contradicts_count}
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Supports ({result.supports_count})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
                    Neutral ({result.neutral_count})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                    Contradicts ({result.contradicts_count})
                  </span>
                </div>
              </div>
            )}

            {/* Paper list */}
            {visibleItems.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {visibleItems.map((item: ConsensusItem) => (
                  <div
                    key={item.paper_id}
                    className="rounded-lg border border-border p-2 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded-full border px-2 py-0 text-[10px] font-semibold ${stanceBadge(item.stance)}`}
                      >
                        {stanceLabel(item.stance)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-xs font-medium text-foreground">
                          {item.title || item.paper_id}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {item.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {displayItems.length > 5 && (
                  <button
                    className="flex w-full items-center justify-center gap-1 py-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? (
                      <>
                        Show fewer <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        Show all {displayItems.length} papers{" "}
                        <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Re-analyze button */}
            <div className="pt-1 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={analyzeConsensus}
                className="h-7 text-xs text-muted-foreground"
              >
                Re-analyze
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
