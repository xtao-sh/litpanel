"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, Layers3, Search, Sparkles } from "lucide-react";

import type { ResearchLandscape } from "@/lib/types";
import { buildAtomDetailHref, buildExplorerAtomHref, buildPaperDetailHref } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LandscapeMethodsCard } from "@/components/research/landscape-methods-card";
import { LandscapeDatasetsCard } from "@/components/research/landscape-datasets-card";
import { LandscapeMechanismsCard } from "@/components/research/landscape-mechanisms-card";
import { LandscapeGapsCard } from "@/components/research/landscape-gaps-card";
import { LandscapeChinaCard } from "@/components/research/landscape-china-card";

interface ProjectSynthesisPanelProps {
  landscape: ResearchLandscape | null | undefined;
  originQuery?: string | null;
  paperCount: number;
  projectSlug?: string;
  showIntro?: boolean;
  showSummaryGrid?: boolean;
}

function SummaryCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function ProjectSynthesisPanel({
  landscape,
  originQuery,
  paperCount,
  projectSlug,
  showIntro = true,
  showSummaryGrid = true,
}: ProjectSynthesisPanelProps) {
  const router = useRouter();

  if (!landscape) {
    return null;
  }

  const topField = landscape.fieldDistribution[0];
  const years = landscape.yearDistribution.map((item) => item.year);
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;
  const topMethod = landscape.methods[0];
  const totalGapSignals =
    landscape.gaps.limitations.length +
    landscape.gaps.openQuestions.length +
    landscape.gaps.unusedMethods.length +
    landscape.gaps.unusedDatasets.length;
  const hasAnyContent =
    landscape.methods.length > 0 ||
    landscape.datasets.length > 0 ||
    landscape.mechanisms.length > 0 ||
    totalGapSignals > 0 ||
    landscape.fieldDistribution.length > 0;

  if (!hasAnyContent) {
    return null;
  }

  const getExplorerHref = (atomSlug: string) =>
    buildExplorerAtomHref({
      atomSlug,
      query: originQuery ?? "",
      returnTo: projectSlug ? `/projects/${projectSlug}` : "/projects",
    });
  const getAtomDetailHref = (atomSlug: string) =>
    buildAtomDetailHref({
      atomSlug,
      returnTo: projectSlug ? `/projects/${projectSlug}` : "/projects",
    });
  const getPaperDetailHref = (paperId: string) =>
    buildPaperDetailHref({
      paperId,
      returnTo: projectSlug ? `/projects/${projectSlug}` : "/projects",
    });

  return (
    <div className="space-y-6">
      {showIntro && (
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Project Synthesis Snapshot</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                This summary is computed from the {paperCount.toLocaleString()} paper
                {paperCount !== 1 ? "s" : ""} currently attached to this project. Counts are based on
                linked atoms, card sections, and the paper metadata already in the knowledge base.
              </p>
            </div>
            {originQuery && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/research?q=${encodeURIComponent(originQuery)}`}>
                  Reopen Research Query
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {showSummaryGrid && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Primary Field"
            value={topField?.field ?? "Not classified"}
            detail={
              topField
                ? `${topField.count} paper${topField.count !== 1 ? "s" : ""} in the dominant field.`
                : "No field tags were available for this project set."
            }
          />
          <SummaryCard
            title="Time Span"
            value={
              minYear != null && maxYear != null
                ? minYear === maxYear
                  ? String(minYear)
                  : `${minYear}-${maxYear}`
                : "Unknown"
            }
            detail={
              minYear != null && maxYear != null
                ? `${landscape.yearDistribution.length} publication year bucket${landscape.yearDistribution.length !== 1 ? "s" : ""} represented.`
                : "No year distribution is available yet."
            }
          />
          <SummaryCard
            title="Top Method"
            value={topMethod?.title ?? "Not mapped"}
            detail={
              topMethod
                ? `Appears in ${topMethod.paperCount} paper${topMethod.paperCount !== 1 ? "s" : ""} within this project.`
                : "No linked method atoms were found for this project set."
            }
          />
          <SummaryCard
            title="Gap Signals"
            value={String(totalGapSignals)}
            detail="Combined limitations, open questions, unused methods, and unused datasets."
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Layers3 className="h-4 w-4 text-sky-500" />
              Field Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {landscape.fieldDistribution.slice(0, 8).map((item) => {
              const width = topField ? Math.max((item.count / topField.count) * 100, 8) : 0;
              return (
                <div key={item.field} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-foreground">{item.field}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.count} paper{item.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-sky-500/70"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarRange className="h-4 w-4 text-violet-500" />
              Publication Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {landscape.yearDistribution.length > 0 ? (
              landscape.yearDistribution.map((item) => {
                const maxCount = Math.max(...landscape.yearDistribution.map((year) => year.count), 1);
                const width = Math.max((item.count / maxCount) * 100, 8);
                return (
                  <div key={item.year} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground">{item.year}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.count} paper{item.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-violet-500/70"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No year metadata available for this project yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {totalGapSignals > 0 && (
        <LandscapeGapsCard
          gaps={landscape.gaps}
          onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
          getExplorerHref={getExplorerHref}
          getPaperHref={getPaperDetailHref}
          actionMode="buttons"
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {landscape.methods.length > 0 && (
          <LandscapeMethodsCard
            methods={landscape.methods.slice(0, 12)}
            onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
            getExplorerHref={getExplorerHref}
            actionMode="buttons"
          />
        )}
        {landscape.datasets.length > 0 && (
          <LandscapeDatasetsCard
            datasets={landscape.datasets.slice(0, 12)}
            onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
            getExplorerHref={getExplorerHref}
            actionMode="buttons"
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {landscape.mechanisms.length > 0 && (
          <LandscapeMechanismsCard
            mechanisms={landscape.mechanisms.slice(0, 12)}
            onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
            getExplorerHref={getExplorerHref}
            actionMode="buttons"
          />
        )}
        <LandscapeChinaCard chinaApplicability={landscape.chinaApplicability} />
      </div>

      {landscape.puzzles.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Open Puzzles Already Present
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {landscape.puzzles.slice(0, 8).map((puzzle) => (
              <div
                key={puzzle.slug}
                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => router.push(getAtomDetailHref(puzzle.slug))}
                    className="text-left text-sm font-medium text-foreground hover:text-primary"
                  >
                    {puzzle.title}
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => router.push(getAtomDetailHref(puzzle.slug))}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Detail
                    </button>
                    <Link
                      href={getExplorerHref(puzzle.slug)}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                    >
                      <Search className="h-3 w-3" />
                      Explorer
                    </Link>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {puzzle.paperCount} paper{puzzle.paperCount !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
