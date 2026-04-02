"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendingTopic } from "@/lib/types";

interface TrendingTopicsProps {
  data: TrendingTopic[] | undefined;
  loading: boolean;
}

function formatGrowthRate(rate: number): string {
  const pct = Math.round(rate * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function categoryBadgeClass(category: string): string {
  if (category === "field") {
    return "bg-blue-100 text-blue-800";
  }
  return "bg-purple-100 text-purple-800";
}

export function TrendingTopics({ data, loading }: TrendingTopicsProps) {
  const rising = data?.filter((t) => t.trend === "rising").slice(0, 5) ?? [];
  const declining = data
    ?.filter((t) => t.trend === "declining")
    .sort((a, b) => a.growthRate - b.growthRate)
    .slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Trending Topics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Rising section */}
            {rising.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Rising
                </h3>
                <div className="space-y-0.5">
                  {rising.map((topic) => (
                    <div
                      key={`${topic.category}-${topic.name}`}
                      className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/60 transition-colors"
                    >
                      <span className="text-green-600 text-sm font-medium shrink-0">
                        {"\u2191"}
                      </span>
                      <Link
                        href={`/research?q=${encodeURIComponent(topic.name)}`}
                        className="text-sm text-foreground flex-1 min-w-0 truncate hover:underline hover:text-blue-700 transition-colors"
                      >
                        {topic.name}
                      </Link>
                      <Badge
                        variant="secondary"
                        className={`text-xs px-1.5 py-0 shrink-0 ${categoryBadgeClass(topic.category)}`}
                      >
                        {topic.category}
                      </Badge>
                      <span className="text-xs font-semibold text-green-600 tabular-nums shrink-0 w-12 text-right">
                        {formatGrowthRate(topic.growthRate)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                        {topic.recentCount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Declining section */}
            {declining.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Declining
                </h3>
                <div className="space-y-0.5">
                  {declining.map((topic) => (
                    <div
                      key={`${topic.category}-${topic.name}`}
                      className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-accent/60 transition-colors"
                    >
                      <span className="text-red-500 text-sm font-medium shrink-0">
                        {"\u2193"}
                      </span>
                      <Link
                        href={`/research?q=${encodeURIComponent(topic.name)}`}
                        className="text-sm text-foreground flex-1 min-w-0 truncate hover:underline hover:text-blue-700 transition-colors"
                      >
                        {topic.name}
                      </Link>
                      <Badge
                        variant="secondary"
                        className={`text-xs px-1.5 py-0 shrink-0 ${categoryBadgeClass(topic.category)}`}
                      >
                        {topic.category}
                      </Badge>
                      <span className="text-xs font-semibold text-red-500 tabular-nums shrink-0 w-12 text-right">
                        {formatGrowthRate(topic.growthRate)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                        {topic.recentCount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rising.length === 0 && declining.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No trend data available yet.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
