"use client";

import Link from "next/link";
import { use } from "react";
import {
  ArrowRight,
  Clock3,
  FileText,
  FlaskConical,
  GitBranch,
  GitBranchPlus,
  Search,
  Sparkles,
} from "lucide-react";

import { MarkdownRenderer } from "@/components/maps/markdown-renderer";
import { ProjectChronologyPanel } from "@/components/projects/project-chronology-panel";
import { ProjectPageShell } from "@/components/projects/project-page-shell";
import { ProjectSynthesisPanel } from "@/components/projects/project-synthesis-panel";
import { ProjectTopicDossierPanel } from "@/components/projects/project-topic-dossier-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildExplorerPaperHref,
  buildPaperDetailHref,
  buildProjectGraphHref,
} from "@/lib/navigation";
import type { Project } from "@/lib/types";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

function formatYearSpan(project: Project): string {
  const years = project.landscape?.yearDistribution.map((item) => item.year) ?? [];
  if (years.length === 0) return "Unknown";
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`;
}

function gapSignalCount(project: Project): number {
  const gaps = project.landscape?.gaps;
  if (!gaps) return 0;
  return (
    gaps.unusedMethods.length +
    gaps.unusedDatasets.length +
    gaps.openQuestions.length +
    gaps.limitations.length
  );
}

function summarizeTopTitles(items: { title: string }[] | undefined, limit = 2): string | null {
  if (!items || items.length === 0) return null;
  const titles = items
    .map((item) => item.title?.trim())
    .filter((title): title is string => Boolean(title))
    .slice(0, limit);
  return titles.length > 0 ? titles.join(", ") : null;
}

function buildProjectNarrativeFallback(project: Project): string[] {
  const landscape = project.landscape;
  if (!landscape) {
    return [
      "This project has a saved paper set and source context, but the synthesis layer has not been generated yet.",
      "Use Dossier, Chronology, and Matrix to inspect the corpus while the project narrative is still being filled in.",
    ];
  }

  const paperCount = project.paperCount.toLocaleString();
  const topField = landscape.fieldDistribution[0]?.field;
  const yearValues = landscape.yearDistribution.map((item) => item.year);
  const minYear = yearValues.length > 0 ? Math.min(...yearValues) : null;
  const maxYear = yearValues.length > 0 ? Math.max(...yearValues) : null;
  const yearSpan =
    minYear == null || maxYear == null
      ? "an unclear publication window"
      : minYear === maxYear
        ? `${minYear}`
        : `${minYear} to ${maxYear}`;

  const topMethods = summarizeTopTitles(landscape.methods);
  const topDatasets = summarizeTopTitles(landscape.datasets);
  const topMechanisms = summarizeTopTitles(landscape.mechanisms);
  const gapCount = gapSignalCount(project);

  const intro = project.originQuery
    ? `This draft tracks ${paperCount} papers around "${project.originQuery}"${topField ? `, anchored mainly in ${topField}` : ""}.`
    : `This draft tracks ${paperCount} papers${topField ? `, anchored mainly in ${topField}` : ""}.`;

  const chronology =
    yearSpan === "an unclear publication window"
      ? "The publication timeline still needs to be mapped more clearly."
      : `The current corpus spans ${yearSpan}, which gives you enough coverage to read it as a coherent research thread rather than a loose paper list.`;

  const methodsLine =
    topMethods || topDatasets || topMechanisms
      ? `The current synthesis points first to ${topMethods ? `methods such as ${topMethods}` : "a consistent method layer"}${topDatasets ? `, datasets such as ${topDatasets}` : ""}${topMechanisms ? `, and mechanisms such as ${topMechanisms}` : ""}.`
      : "The current synthesis still needs explicit method, dataset, and mechanism labeling.";

  const gapsLine =
    gapCount > 0
      ? `There are already ${gapCount} visible gap signals across limitations, open questions, and underused methods or datasets, so the next useful step is to turn this draft into a more explicit thematic review.`
      : "Gap signals have not been surfaced yet, so the next useful step is to inspect the dossier and chronology views before writing a stronger review narrative.";

  return [intro, chronology, methodsLine, gapsLine];
}

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="overview">
      {(project) => (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Project Narrative</CardTitle>
              </CardHeader>
              <CardContent>
                {project.overviewContent ? (
                  <div className="max-w-3xl">
                    <MarkdownRenderer content={project.overviewContent} />
                  </div>
                ) : (
                  <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                    {buildProjectNarrativeFallback(project).map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">At A Glance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Primary field</span>
                    <span className="text-right font-medium text-foreground">
                      {project.landscape?.fieldDistribution[0]?.field ?? "Not classified"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Time span</span>
                    <span className="text-right font-medium text-foreground">
                      {formatYearSpan(project)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Top method</span>
                    <span className="text-right font-medium text-foreground">
                      {project.landscape?.methods[0]?.title ?? "Not mapped"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Gap signals</span>
                    <span className="text-right font-medium text-foreground">
                      {gapSignalCount(project)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Start Here</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Link
                    href={`/projects/${project.slug}/dossier`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">Dossier</p>
                      <p className="text-muted-foreground">Read the topic anchor, maturity signal, chronology, and synthesis in one place.</p>
                    </div>
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/chronology`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">Chronology</p>
                      <p className="text-muted-foreground">Trace the publication arc and representative papers over time.</p>
                    </div>
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/themes`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">Themes</p>
                      <p className="text-muted-foreground">See the main topic groupings and cluster structure.</p>
                    </div>
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/methods`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">Methods</p>
                      <p className="text-muted-foreground">Inspect the empirical strategies, data, and mechanisms.</p>
                    </div>
                    <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/gaps`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">Gaps</p>
                      <p className="text-muted-foreground">Review limitations, open questions, and missing methods or datasets.</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/matrix`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">Matrix</p>
                      <p className="text-muted-foreground">Compare the included papers side by side.</p>
                    </div>
                    <GitBranchPlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>

              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Corpus Access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>Use Explorer for row-level filtering, or jump straight to the comparison matrix for cross-paper reading.</p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildExplorerPaperHref({
                        query: project.originQuery ?? "",
                        returnTo: `/projects/${project.slug}`,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Open in Explorer
                    </Link>
                    <Link
                      href={buildProjectGraphHref({
                        paperIds: project.paperIds,
                        projectSlug: project.slug,
                        projectTitle: project.title,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      Project Graph
                    </Link>
                    <Link
                      href={`/projects/${project.slug}/matrix`}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Compare in Matrix
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <ProjectSynthesisPanel
            landscape={project.landscape}
            originQuery={project.originQuery}
            paperCount={project.paperCount}
            projectSlug={project.slug}
            showIntro={false}
            showSummaryGrid={false}
          />

          <ProjectTopicDossierPanel project={project} />

          <ProjectChronologyPanel project={project} compact />

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">Included Papers</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Overview keeps this to a preview so the page stays readable. Use Explorer or Matrix for the full working set.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildExplorerPaperHref({
                      query: project.originQuery ?? "",
                      returnTo: `/projects/${project.slug}`,
                    })}
                    className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Full set in Explorer
                  </Link>
                  <Link
                    href={buildProjectGraphHref({
                      paperIds: project.paperIds,
                      projectSlug: project.slug,
                      projectTitle: project.title,
                    })}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Open Graph
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/matrix`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Open Matrix
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.papers && project.papers.length > 0 ? (
                <>
                  {project.papers.slice(0, 8).map((paper) => (
                    <div
                      key={paper.paperId}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
                    >
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={buildPaperDetailHref({
                              paperId: paper.paperId,
                              returnTo: `/projects/${project.slug}`,
                            })}
                            className="text-sm font-medium text-foreground hover:text-primary"
                          >
                            {paper.title || paper.paperId}
                          </Link>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {paper.paperId}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {paper.year && <span>{paper.year}</span>}
                          {paper.fields.slice(0, 3).map((field) => (
                            <span key={field} className="rounded bg-muted px-1.5 py-0.5">
                              {field}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Link
                            href={buildPaperDetailHref({
                              paperId: paper.paperId,
                              returnTo: `/projects/${project.slug}`,
                            })}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            Detail
                          </Link>
                          <Link
                            href={buildExplorerPaperHref({
                              query: paper.paperId,
                              returnTo: `/projects/${project.slug}`,
                            })}
                            className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                          >
                            <Search className="h-3 w-3" />
                            Explorer
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}

                  {project.papers.length > 8 && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                      Showing 8 of {project.papers.length} papers in the overview. Use Explorer or Matrix for the full set.
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No papers listed in this project yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ProjectPageShell>
  );
}
