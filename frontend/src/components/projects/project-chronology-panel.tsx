"use client";

import Link from "next/link";
import { ArrowRight, CalendarRange, Clock3, Info, Star, TrendingUp } from "lucide-react";

import { buildPaperDetailHref, buildProjectGraphHref } from "@/lib/navigation";
import type { Paper, Project } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  if (score == null) return "bg-[var(--paper-2)] text-[var(--ink-4)]";
  if (score >= 8) return "bg-[var(--forest-soft)] text-[var(--forest-2)]";
  if (score >= 6) return "bg-[#e9eef6] text-[#1b2e4d]";
  if (score >= 4) return "bg-[#f4ead8] text-[#654814]";
  return "bg-[var(--paper-2)] text-[var(--ink-4)]";
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
    <Card className="lp-card rounded-[var(--r-md)] shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-[var(--forest)]" />
          {title}
        </CardTitle>
        <p className="text-sm leading-relaxed text-[var(--ink-4)]">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {papers.length > 0 ? (
          papers.map((paper) => (
            <div
              key={paper.paperId}
              className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={buildPaperDetailHref({ paperId: paper.paperId, returnTo })}
                    className="font-display text-[1.1rem] text-[var(--ink)] transition-colors hover:text-[var(--forest)]"
                  >
                    {paper.title || paper.paperId}
                  </Link>
                  {paper.tldr && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--ink-4)]">
                      {paper.tldr}
                    </p>
                  )}
                </div>
                <Link
                  href={buildPaperDetailHref({ paperId: paper.paperId, returnTo })}
                  className="shrink-0 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
                >
                  Detail
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-4)]">
                {paper.year != null && (
                  <span className="rounded-full bg-[var(--paper-2)] px-2 py-0.5 font-medium text-[var(--ink)]">
                    {paper.year}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${scoreBadgeClass(paper.averageScore)}`}
                >
                  {formatScore(paper.averageScore)}
                </span>
                {paper.fields.slice(0, 2).map((field) => (
                  <span key={field} className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[var(--ink)]">
                    {field}
                  </span>
                ))}
                {paper.fields.length > 2 && (
                  <span className="rounded-full bg-[var(--paper-2)] px-2 py-0.5">
                    +{paper.fields.length - 2} fields
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--ink-4)]">No papers matched this chronology slice yet.</p>
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
        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Opening year</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-[var(--ink)]">
              {earliestYear != null ? earliestYear : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              The earliest publication year currently present in this project set.
            </p>
          </CardContent>
        </Card>

        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Latest year</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-[var(--ink)]">
              {latestYear != null ? latestYear : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              The newest wave in the project corpus based on publication year.
            </p>
          </CardContent>
        </Card>

        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Peak year</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-[var(--ink)]">
              {peakYearEntry ? `${peakYearEntry.year}` : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              {peakYearEntry
                ? `${peakYearEntry.count} paper${peakYearEntry.count !== 1 ? "s" : ""} in the busiest year.`
                : "No year distribution is available yet."}
            </p>
          </CardContent>
        </Card>

        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">Recent wave</p>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.25rem] text-[var(--ink)]">
              {recentThreshold != null ? `${recentShare}%` : "Unknown"}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              {recentThreshold != null
                ? `${recentCount} paper${recentCount !== 1 ? "s" : ""} published since ${recentThreshold}.`
                : "Not enough year metadata to estimate recency concentration."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <CalendarRange className="h-4 w-4 text-[var(--forest)]" />
                  Publication Arc
                </CardTitle>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
                  Use this to see whether the project is anchored by older foundational work or driven by a recent wave.
                </p>
              </div>
              {compact && (
                <Link
                  href={`/projects/${project.slug}/chronology`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--forest)] hover:text-[var(--forest)]/90"
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
                    <span className="font-medium text-[var(--ink)]">{entry.year}</span>
                    <span className="text-xs text-[var(--ink-4)]">
                      {entry.count} paper{entry.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--paper-3)]">
                    <div
                      className="h-2 rounded-full bg-[var(--ink)]/80"
                      style={{ width: `${Math.max((entry.count / maxYearCount) * 100, 8)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--ink-4)]">This project does not have enough year metadata yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-4">
            <p className="section-kicker">Reading guide</p>
            <CardTitle className="flex items-center gap-2 font-display text-[1.7rem] text-[var(--ink)]">
              Reading Guide
              <TooltipProvider delayDuration={180}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                      aria-label="Reading guide help"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs rounded-[var(--r)] border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-xs leading-relaxed text-[var(--ink)] shadow-[var(--shadow-2)]">
                    Read the foundations first, then the recent wave, then compare representative
                    papers in Matrix to see how the topic evolved.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--ink-4)]">
            <p>
              <span className="font-medium text-[var(--ink)]">Foundation:</span>{" "}
              {earliestYear != null
                ? `This project starts as early as ${earliestYear}.`
                : "The earliest foundation year is not yet available."}
            </p>
            <p>
              <span className="font-medium text-[var(--ink)]">Momentum:</span>{" "}
              {peakYearEntry
                ? `The densest year in the current corpus is ${peakYearEntry.year}.`
                : "There is no peak year estimate yet."}
            </p>
            <p>
              <span className="font-medium text-[var(--ink)]">Recency:</span>{" "}
              {recentThreshold != null
                ? `${recentShare}% of this paper set sits in the last three visible publication years.`
                : "Recency concentration cannot be estimated yet."}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href={`/projects/${project.slug}/matrix`}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
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
                className="inline-flex items-center gap-1 rounded-full border border-[var(--forest)] bg-[var(--forest-soft)] px-3 py-2 text-xs font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest-soft)]"
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
