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
      <Card className="paper-panel rounded-[1.8rem] shadow-none">
        <CardHeader className="pb-4">
          <p className="section-kicker">Topic dossier</p>
          <CardTitle className="font-display text-[2rem] text-foreground">Topic Dossier</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This project now acts as a topic dossier: an anchored paper set, a chronology, and a
            synthesis layer tied back to the underlying research question.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.3rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Topic Anchor
              </p>
              <p className="font-display mt-2 text-[1.95rem] text-foreground">{topicAnchor}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                The query or title that currently defines the boundary of this project corpus.
              </p>
            </div>
            <div className="rounded-[1.3rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Current Scope
              </p>
              <p className="font-display mt-2 text-[1.95rem] text-foreground">
                {project.paperCount} papers
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Spanning {formatYearSpan(project)} with {topField} as the dominant field signal.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.1rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-background/85 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dominant Field
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">{topField}</p>
            </div>
            <div className="rounded-[1.1rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-background/85 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Leading Method
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">{topMethod}</p>
            </div>
            <div className="rounded-[1.1rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-background/85 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Why This Matters
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use the project to hold a stable corpus while you compare papers, track chronology,
                and test whether the topic still has room for a differentiated contribution.
              </p>
            </div>
          </div>

          <div className="rounded-[1.45rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.38)] p-4">
            <p className="section-kicker">Next moves</p>
            <p className="font-display mt-2 text-[1.55rem] text-foreground">Where To Push The Topic</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Reopen the topic workspace if the query boundary needs refinement. Stay in Projects if
              the corpus is stable enough for comparison, chronology, and gap framing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={buildResearchHref({ query: topicAnchor })}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <Microscope className="h-3.5 w-3.5" />
                Topic Workspace
              </Link>
              <Link
                href={buildExplorerPaperHref({
                  query: topicAnchor,
                  returnTo: `/projects/${project.slug}`,
                })}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
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
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Open Graph
              </Link>
              <Link
                href={`/projects/${project.slug}/gaps`}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
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
