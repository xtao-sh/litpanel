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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-sky-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScoreDot({
  value,
  color,
  label,
  shortLabel,
}: {
  value: number | null;
  color: string;
  label: string;
  shortLabel: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <span className="text-[9px] text-muted-foreground">{shortLabel}</span>
      <span
        className={`inline-block h-2 w-2 rounded-full ${color}`}
      />
      {value !== null ? value.toFixed(1) : "--"}
    </span>
  );
}

export function ActiveIdeas({ ideas, loading }: ActiveIdeasProps) {
  return (
    <Card className="paper-panel rounded-[1.45rem] border-border/75 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-kicker">Active Ideas</p>
            <CardTitle className="mt-2 font-display text-[1.45rem] text-foreground">
              Active Research Ideas
            </CardTitle>
          </div>
          <Link
            href="/ideas"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !ideas ? (
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
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
          <p className="py-4 text-center text-sm text-muted-foreground">
            No active ideas yet.
          </p>
        ) : (
          <div className="space-y-1">
            {ideas.slice(0, 10).map((idea) => (
              <Link
                key={idea.id}
                href={`/ideas#idea-${idea.id}`}
                className="group -mx-2 block rounded-[1rem] px-2 py-2 transition-colors hover:bg-[color:oklch(var(--accent)/0.4)]"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                    #{idea.id}
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-1 text-sm text-foreground transition-colors group-hover:text-primary">
                    {idea.title}
                  </span>
                </div>
                <div className="ml-7">
                  <div className="flex items-center">
                    <div className="flex-1">
                      <ScoreBar value={idea.composite} />
                    </div>
                    <span className="ml-1.5 text-xs font-medium tabular-nums text-muted-foreground">{idea.composite?.toFixed(1) ?? '--'}</span>
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    <ScoreDot
                      value={idea.novelty}
                      color="bg-violet-400"
                      label="Novelty"
                      shortLabel="N"
                    />
                    <ScoreDot
                      value={idea.feasibility}
                      color="bg-green-400"
                      label="Feasibility"
                      shortLabel="F"
                    />
                    <ScoreDot
                      value={idea.impact}
                      color="bg-amber-400"
                      label="Impact"
                      shortLabel="I"
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
