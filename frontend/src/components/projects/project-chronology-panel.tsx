"use client";

import Link from "next/link";
import { ArrowRight, CalendarRange, Clock3, Star, TrendingUp } from "lucide-react";

import { buildPaperDetailHref, buildProjectGraphHref } from "@/lib/navigation";
import type { Paper, Project } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectChronologyPanelProps {
  project: Project;
  compact?: boolean;
}

function sortByYearAsc(a: Paper, b: Paper) {
  const aYear = a.year ?? Number.MAX_SAFE_INTEGER;
  const bYear = b.year ?? Number.MAX_SAFE_INTEGER;
  if (aYear !== bYear) {
    return aYear - bYear;
  }
  return (b.averageScore ?? 0) - (a.averageScore ?? 0);
}

function sortByYearDesc(a: Paper, b: Paper) {
  const aYear = a.year ?? Number.MIN_SAFE_INTEGER;
  const bYear = b.year ?? Number.MIN_SAFE_INTEGER;
  if (aYear !== bYear) {
    return bYear - aYear;
  }
  return (b.averageScore ?? 0) - (a.averageScore ?? 0);
}

function sortByScoreDesc(a: Paper, b: Paper) {
  const aScore = a.averageScore ?? Number.NEGATIVE_INFINITY;
  const bScore = b.averageScore ?? Number.NEGATIVE_INFINITY;
  if (aScore !== bScore) {
    return bScore - aScore;
  }
  return sortByYearDesc(a, b);
}

function pickDistinctPapers(source: Paper[], limit: number, used: Set<string>) {
  const selected: Paper[] = [];

  for (const paper of source) {
    if (used.has(paper.paperId)) {
      continue;
    }
    selected.push(paper);
    used.add(paper.paperId);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function scoreBadgeClass(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 8) return "bg-emerald-100 text-emerald-800";
  if (score >= 6) return "bg-blue-100 text-blue-800";
  if (score >= 4) return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}

function formatScore(score: number | null | undefined) {
  return score == null ? "Unscored" : score.toFixed(1);
}

function PaperList({
  title,
  description,
  papers,
  returnTo,
  icon,
}: {
  title: string;
  description: string;
  papers: Paper[];
  returnTo: string;
  icon: "foundations" | "recent" | "representative";
}) {
  const Icon = icon === "foundations" ? Clock3 : icon === "recent" ? TrendingUp : Star;

  return (
    <Card className="paper-panel rounded-[1.55rem] shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {papers.length > 0 ? (
          papers.map((paper) => (
            <div
              key={paper.paperId}
              className="rounded-[1.1rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.3)] px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={buildPaperDetailHref({ paperId: paper.paperId, returnTo })}
                    className="font-display text-[1.1rem] text-foreground transition-colors hover:text-primary"
                  >
                    {paper.title || paper.paperId}
                  </Link>
                  {paper.tldr && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {paper.tldr}
                    </p>
                  )}
                </div>
                <Link
                  href={buildPaperDetailHref({ paperId: paper.paperId, returnTo })}
                  className="shrink-0 rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  Detail
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {paper.year != null && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    {paper.year}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${scoreBadgeClass(paper.averageScore)}`}
                >
                  {formatScore(paper.averageScore)}
                </span>
                {paper.fields.slice(0, 2).map((field) => (
                  <span key={field} className="rounded-full bg-background/80 px-2 py-0.5 text-foreground">
                    {field}
                  </span>
                ))}
                {paper.fields.length > 2 && (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    +{paper.fields.length - 2} fields
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No papers matched this chronology slice yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectChronologyPanel({
  project,
  compact = false,
}: ProjectChronologyPanelProps) {
  const timeline = (project.landscape?.yearDistribution ?? [])
    .slice()
    .sort((a, b) => a.year - b.year);
  const papers = (project.papers ?? []).slice();
  const earliestYear = timeline[0]?.year ?? null;
  const latestYear = timeline[timeline.length - 1]?.year ?? null;
  const peakYearEntry =
    timeline.length > 0
      ? timeline.reduce((best, current) => (current.count > best.count ? current : best), timeline[0])
      : null;
  const recentThreshold = latestYear != null ? latestYear - 2 : null;
  const recentCount =
    recentThreshold != null
      ? timeline
          .filter((entry) => entry.year >= recentThreshold)
          .reduce((sum, entry) => sum + entry.count, 0)
      : 0;
  const recentShare =
    project.paperCount > 0 ? Math.round((recentCount / project.paperCount) * 100) : 0;
  const maxYearCount = Math.max(...timeline.map((entry) => entry.count), 1);
  const returnTo = compact ? `/projects/${project.slug}` : `/projects/${project.slug}/chronology`;

  const usedPaperIds = new Set<string>();
  const foundationPapers = pickDistinctPapers(
    papers.slice().sort(sortByYearAsc),
    compact ? 3 : 5,
    usedPaperIds,
  );
  const recentPapers = pickDistinctPapers(
    papers.slice().sort(sortByYearDesc),
    compact ? 4 : 6,
    usedPaperIds,
  );
  const representativePapers = pickDistinctPapers(
    papers
      .slice()
      .sort((a, b) => {
        if (a.hasCard !== b.hasCard) {
          return a.hasCard ? -1 : 1;
        }
        return sortByScoreDesc(a, b);
      }),
    compact ? 3 : 5,
    usedPaperIds,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="paper-panel rounded-[1.4rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Opening year</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-foreground">
              {earliestYear != null ? earliestYear : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The earliest publication year currently present in this project set.
            </p>
          </CardContent>
        </Card>

        <Card className="paper-panel rounded-[1.4rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Latest year</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-foreground">
              {latestYear != null ? latestYear : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The newest wave in the project corpus based on publication year.
            </p>
          </CardContent>
        </Card>

        <Card className="paper-panel rounded-[1.4rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Peak year</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-foreground">
              {peakYearEntry ? `${peakYearEntry.year}` : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {peakYearEntry
                ? `${peakYearEntry.count} paper${peakYearEntry.count !== 1 ? "s" : ""} in the busiest year.`
                : "No year distribution is available yet."}
            </p>
          </CardContent>
        </Card>

        <Card className="paper-panel rounded-[1.4rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Recent wave</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-foreground">
              {recentThreshold != null ? `${recentShare}%` : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {recentThreshold != null
                ? `${recentCount} paper${recentCount !== 1 ? "s" : ""} published since ${recentThreshold}.`
                : "Not enough year metadata to estimate recency concentration."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="paper-panel rounded-[1.65rem] shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  Publication Arc
                </CardTitle>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Use this to see whether the project is anchored by older foundational work or driven by a recent wave.
                </p>
              </div>
              {compact && (
                <Link
                  href={`/projects/${project.slug}/chronology`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/90"
                >
                  Full chronology
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {timeline.length > 0 ? (
              timeline.map((entry) => (
                <div key={entry.year} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{entry.year}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.count} paper{entry.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[color:oklch(var(--accent)/0.55)]">
                    <div
                      className="h-2 rounded-full bg-primary/80"
                      style={{ width: `${Math.max((entry.count / maxYearCount) * 100, 8)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">This project does not have enough year metadata yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="paper-panel rounded-[1.65rem] shadow-none">
          <CardHeader className="pb-4">
            <p className="section-kicker">Reading guide</p>
            <CardTitle className="font-display text-[1.7rem] text-foreground">Reading Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Foundation:</span>{" "}
              {earliestYear != null
                ? `This project starts as early as ${earliestYear}.`
                : "The earliest foundation year is not yet available."}
            </p>
            <p>
              <span className="font-medium text-foreground">Momentum:</span>{" "}
              {peakYearEntry
                ? `The densest year in the current corpus is ${peakYearEntry.year}.`
                : "There is no peak year estimate yet."}
            </p>
            <p>
              <span className="font-medium text-foreground">Recency:</span>{" "}
              {recentThreshold != null
                ? `${recentShare}% of this paper set sits in the last three visible publication years.`
                : "Recency concentration cannot be estimated yet."}
            </p>
            <p>
              <span className="font-medium text-foreground">How to use it:</span>{" "}
              Read the foundations first, then the recent wave, then compare the representative papers in Matrix to see how the topic evolved.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href={`/projects/${project.slug}/matrix`}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                Open Matrix
              </Link>
              <Link
                href={buildProjectGraphHref({
                  paperIds: project.paperIds,
                  projectSlug: project.slug,
                  projectTitle: project.title,
                  tab: compact ? "overview" : "chronology",
                  label: `${project.title} chronology`,
                })}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              >
                Open Graph
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <PaperList
          title="Foundational Papers"
          description="The earliest visible papers in this corpus. Use them to understand where the topic starts."
          papers={foundationPapers}
          returnTo={returnTo}
          icon="foundations"
        />
        <PaperList
          title="Recent Wave"
          description="The newest papers currently attached to this project. Use them to see what is active now."
          papers={recentPapers}
          returnTo={returnTo}
          icon="recent"
        />
        <PaperList
          title="Representative Papers"
          description="Higher-signal papers for quick orientation, prioritizing deep-read coverage and score."
          papers={representativePapers}
          returnTo={returnTo}
          icon="representative"
        />
      </div>
    </div>
  );
}
