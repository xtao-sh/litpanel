"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Idea } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

interface ActiveIdeasProps {
  ideas: Idea[] | undefined;
  loading: boolean;
}

function ScoreMetric({
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
    <span className="flex items-center gap-1 text-xs text-[var(--ink-4)]" title={label}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${color}`}
      />
      <span className="text-[9px] text-[var(--ink-4)]">{shortLabel}</span>
      {value !== null ? value.toFixed(1) : "--"}
    </span>
  );
}

export function ActiveIdeas({ ideas, loading }: ActiveIdeasProps) {
  const { t } = useI18n();

  return (
    <Card className="lp-card rounded-[var(--r-md)] border-[var(--line-soft)] shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {t("dashboard.activeIdeas.title")}
          </CardTitle>
          <Link
            href="/ideas"
            className="text-xs font-medium text-[var(--forest)] hover:underline"
          >
            {t("dashboard.actions.viewAll")}
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !ideas ? (
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-3 pt-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            ))}
          </div>
        ) : ideas.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--ink-4)]">
            {t("dashboard.activeIdeas.empty")}
          </p>
        ) : (
          <div className="space-y-1">
            {ideas.slice(0, 10).map((idea) => (
              <Link
                key={idea.id}
                href={`/ideas#idea-${encodeURIComponent(idea.id)}`}
                className="group -mx-2 block rounded-[var(--r-md)] px-2 py-2 transition-colors hover:bg-[var(--paper-2)]"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="min-w-0 flex-1 line-clamp-1 text-sm text-[var(--ink)] transition-colors group-hover:text-[var(--forest)]">
                    {idea.title}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <ScoreMetric
                    value={idea.composite}
                    color="bg-[#2c4870]"
                    label={t("dashboard.activeIdeas.composite")}
                    shortLabel={t("dashboard.activeIdeas.compositeShort")}
                  />
                  <ScoreMetric
                    value={idea.novelty}
                    color="bg-[#6f86a6]"
                    label={t("dashboard.activeIdeas.novelty")}
                    shortLabel="N"
                  />
                  <ScoreMetric
                    value={idea.feasibility}
                    color="bg-[var(--forest)]"
                    label={t("dashboard.activeIdeas.feasibility")}
                    shortLabel="F"
                  />
                  <ScoreMetric
                    value={idea.impact}
                    color="bg-[#b88a3b]"
                    label={t("dashboard.activeIdeas.impact")}
                    shortLabel="I"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
