"use client";

import { use } from "react";
import Link from "next/link";
import { Compass, GitBranch, GitBranchPlus, Sparkles } from "lucide-react";

import { ProjectChronologyPanel } from "@/components/projects/project-chronology-panel";
import { ProjectPageShell } from "@/components/projects/project-page-shell";
import { ProjectSynthesisPanel } from "@/components/projects/project-synthesis-panel";
import { ProjectTopicDossierPanel } from "@/components/projects/project-topic-dossier-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildExplorerPaperHref, buildProjectGraphHref } from "@/lib/navigation";

interface ProjectDossierPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectDossierPage({ params }: ProjectDossierPageProps) {
  const { slug } = use(params);

  return (
    <ProjectPageShell slug={slug} activeTab="dossier">
      {(project) => (
        <div className="space-y-6">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How To Read This Dossier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                This page is the topic-level reading path for the current project corpus. Start with
                the topic anchor and saturation signal, then move through chronology, methods,
                datasets, and gaps before opening Matrix or Graph.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={buildExplorerPaperHref({
                    query: project.originQuery ?? project.title,
                    returnTo: `/projects/${project.slug}/dossier`,
                  })}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Compass className="h-3.5 w-3.5" />
                  Corpus In Explorer
                </Link>
                <Link
                  href={buildProjectGraphHref({
                    paperIds: project.paperIds,
                    projectSlug: project.slug,
                    projectTitle: project.title,
                    tab: "dossier",
                    label: `${project.title} dossier`,
                  })}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Dossier Graph
                </Link>
                <Link
                  href={`/projects/${project.slug}/matrix`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <GitBranchPlus className="h-3.5 w-3.5" />
                  Compare In Matrix
                </Link>
                <Link
                  href={`/projects/${project.slug}/gaps`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Review Gaps
                </Link>
              </div>
            </CardContent>
          </Card>

          <ProjectTopicDossierPanel project={project} />

          <ProjectChronologyPanel project={project} />

          <ProjectSynthesisPanel
            landscape={project.landscape}
            originQuery={project.originQuery}
            paperCount={project.paperCount}
            projectSlug={project.slug}
            showIntro={false}
            showSummaryGrid={true}
          />
        </div>
      )}
    </ProjectPageShell>
  );
}
