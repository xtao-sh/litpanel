"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Idea } from "@/lib/types";

interface ActiveIdeasProps {
  ideas: Idea[] | undefined;
  loading: boolean;
}

function ScoreBar({ value, max = 10 }: { value: number | null; max?: number }) {
  const pct = value !== null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-500 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScoreDot({
  value,
  color,
  label,
}: {
  value: number | null;
  color: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500" title={label}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${color}`}
      />
      {value !== null ? value.toFixed(1) : "--"}
    </span>
  );
}

export function ActiveIdeas({ ideas, loading }: ActiveIdeasProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Active Research Ideas
          </CardTitle>
          <Link
            href="/ideas"
            className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !ideas ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            ))}
          </div>
        ) : ideas.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No active ideas yet.
          </p>
        ) : (
          <div className="space-y-1">
            {ideas.slice(0, 10).map((idea) => (
              <Link
                key={idea.id}
                href="/ideas"
                className="block py-2 px-2 -mx-2 rounded-md hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-xs font-mono text-gray-400 shrink-0 pt-0.5">
                    #{idea.id}
                  </span>
                  <span className="text-sm text-gray-800 flex-1 min-w-0 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {idea.title}
                  </span>
                </div>
                <div className="ml-7">
                  <ScoreBar value={idea.composite} />
                  <div className="flex gap-3 mt-1.5">
                    <ScoreDot
                      value={idea.novelty}
                      color="bg-violet-400"
                      label="Novelty"
                    />
                    <ScoreDot
                      value={idea.feasibility}
                      color="bg-green-400"
                      label="Feasibility"
                    />
                    <ScoreDot
                      value={idea.impact}
                      color="bg-amber-400"
                      label="Impact"
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
