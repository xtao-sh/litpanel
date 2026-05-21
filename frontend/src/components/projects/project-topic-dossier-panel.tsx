"use client";

import Link from "next/link";
import { Compass, GitBranch, Microscope, Sparkles } from "lucide-react";

import { buildExplorerPaperHref, buildProjectGraphHref, buildResearchHref } from "@/lib/navigation";
import type { Project } from "@/lib/types";
import { SaturationCard } from "@/components/research/saturation-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectTopicDossierPanelProps {
  project: Project;
}

function formatYearSpan(project: Project): string {
  const years = project.landscape?.yearDistribution.map((item) => item.year) ?? [];
  if (years.length === 0) return "Unknown";
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`;
}

function getTopicAnchor(project: Project): string {
  return (project.originQuery ?? "").trim() || project.title;
}

export function ProjectTopicDossierPanel({
  project,
}: ProjectTopicDossierPanelProps) {
  const topicAnchor = getTopicAnchor(project);
  const topField = project.landscape?.fieldDistribution[0]?.field ?? "Not classified";
  const topMethod = project.landscape?.methods[0]?.title ?? "Not mapped";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_420px]">
      <Card className="lp-card rounded-[var(--r-md)] shadow-none">
        <CardHeader className="pb-4">
          <p className="section-kicker">Topic dossier</p>
          <CardTitle className="font-display text-[2rem] text-[var(--ink)]">Topic Dossier</CardTitle>
          <p className="text-sm leading-relaxed text-[var(--ink-4)]">
            This project now acts as a topic dossier: an anchored paper set, a chronology, and a
            synthesis layer tied back to the underlying research question.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                Topic Anchor
              </p>
              <p className="font-display mt-2 text-[1.95rem] text-[var(--ink)]">{topicAnchor}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
                The query or title that currently defines the boundary of this project corpus.
              </p>
            </div>
            <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                Current Scope
              </p>
              <p className="font-display mt-2 text-[1.95rem] text-[var(--ink)]">
                {project.paperCount} papers
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
                Spanning {formatYearSpan(project)} with {topField} as the dominant field signal.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                Dominant Field
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{topField}</p>
            </div>
            <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                Leading Method
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{topMethod}</p>
            </div>
            <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                Why This Matters
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-4)]">
                Use the project to hold a stable corpus while you compare papers, track chronology,
                and test whether the topic still has room for a differentiated contribution.
              </p>
            </div>
          </div>

          <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-4">
            <p className="section-kicker">Next moves</p>
            <p className="font-display mt-2 text-[1.55rem] text-[var(--ink)]">Where To Push The Topic</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
              Reopen the topic workspace if the query boundary needs refinement. Stay in Projects if
              the corpus is stable enough for comparison, chronology, and gap framing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={buildResearchHref({ query: topicAnchor })}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--forest)] bg-[var(--forest-soft)] px-3.5 py-2 text-sm font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest-soft)]"
              >
                <Microscope className="h-3.5 w-3.5" />
                Topic Workspace
              </Link>
              <Link
                href={buildExplorerPaperHref({
                  query: topicAnchor,
                  returnTo: `/projects/${project.slug}`,
                })}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
              >
                <Compass className="h-3.5 w-3.5" />
                Corpus In Explorer
              </Link>
              <Link
                href={buildProjectGraphHref({
                  paperIds: project.paperIds,
                  projectSlug: project.slug,
                  projectTitle: project.title,
                  tab: "overview",
                  label: `${project.title} dossier`,
                })}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--forest)] bg-[var(--forest-soft)] px-3.5 py-2 text-sm font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest-soft)]"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Open Graph
              </Link>
              <Link
                href={`/projects/${project.slug}/gaps`}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Read Gaps
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <SaturationCard searchQuery={topicAnchor} allPaperIds={project.paperIds} />
    </div>
  );
}
