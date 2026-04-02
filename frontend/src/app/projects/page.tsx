"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import {
  ArrowRight,
  FileSearch,
  FolderOpen,
  Microscope,
  Search,
  Sparkles,
} from "lucide-react";

import { GET_PROJECTS } from "@/lib/queries";
import type { Project } from "@/lib/types";
import {
  getProjectScopeLabel,
  getProjectStatusLabel,
  getProjectTypeLabel,
  getProjectTypeLabelPlural,
  isResearchDraft,
  sortProjectsByUpdatedAt,
} from "@/lib/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function formatUpdatedAt(value: string) {
  if (!value) return "Recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function ProjectsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardHeader>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-36" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="rounded-xl shadow-sm">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
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

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                {project.paperCount} papers
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {getProjectStatusLabel(project.status)}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                {getProjectTypeLabel(project)}
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {getProjectScopeLabel(project.scopeType)}
              </span>
            </div>
            <div>
              <Link
                href={`/projects/${project.slug}`}
                className="text-base font-semibold text-foreground hover:text-primary"
              >
                {project.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {project.description || "No description provided."}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            Updated {formatUpdatedAt(project.updatedAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {project.originQuery && (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Source query:</span> &ldquo;{project.originQuery}&rdquo;
          </div>
        )}

        {project.originFiltersSummary && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Filters:</span> {project.originFiltersSummary}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/projects/${project.slug}`}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Overview
          </Link>
          <Link
            href={`/projects/${project.slug}/themes`}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Themes
          </Link>
          <Link
            href={`/projects/${project.slug}/methods`}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Methods
          </Link>
          <Link
            href={`/projects/${project.slug}/gaps`}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Gaps
          </Link>
          <Link
            href={`/projects/${project.slug}/matrix`}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Matrix
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/projects/${project.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Open project
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {project.originQuery && (
            <Link
              href={`/research?q=${encodeURIComponent(project.originQuery)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Reopen source research
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectSection({
  title,
  description,
  projects,
}: {
  title: string;
  description: string;
  projects: Project[];
}) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </section>
  );
}

export default function ProjectsPage() {
  const { data, loading, error } = useQuery<{ projects: Project[] }>(GET_PROJECTS);
  const rawProjects = data?.projects;

  const sortedProjects = useMemo(
    () => sortProjectsByUpdatedAt(rawProjects ?? []),
    [rawProjects]
  );

  const curatedProjects = useMemo(
    () => sortedProjects.filter((project) => !isResearchDraft(project)),
    [sortedProjects]
  );
  const draftProjects = useMemo(
    () => sortedProjects.filter((project) => isResearchDraft(project)),
    [sortedProjects]
  );

  const totalPapers = useMemo(
    () => sortedProjects.reduce((sum, project) => sum + project.paperCount, 0),
    [sortedProjects]
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              Projects
            </CardTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Projects are the synthesis layer of the site. Use them when a paper set is stable
              enough to become a structured review with themes, methods, gaps, and comparison views.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/research">
                <Microscope className="mr-1.5 h-3.5 w-3.5" />
                Start in Research
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/explorer?tab=papers">
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Browse in Explorer
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How Projects Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>Find and stabilize a topic in Research.</p>
            </div>
            <div className="flex items-start gap-2">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>Capture the paper set as a project or publish one from the knowledge base.</p>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>Use Themes, Methods, Gaps, and Matrix to turn the corpus into a readable review.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading && <ProjectsSkeleton />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load projects.
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Projects"
              value={String(sortedProjects.length)}
              detail="All project workspaces currently available, including curated reviews and research drafts."
            />
            <SummaryCard
              title={getProjectTypeLabelPlural(false)}
              value={String(curatedProjects.length)}
              detail="Project spaces that have moved beyond a direct Research draft state."
            />
            <SummaryCard
              title={getProjectTypeLabelPlural(true)}
              value={String(draftProjects.length)}
              detail="Projects created directly from a stable Research result set."
            />
            <SummaryCard
              title="Papers Covered"
              value={String(totalPapers)}
              detail="Total papers currently attached across all projects."
            />
          </div>

          {sortedProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 text-base font-semibold text-foreground">
                No curated projects yet
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Start with a topic in Research, then promote a stable paper set into a project when
                you are ready to synthesize it.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/research">Open Research</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/explorer?tab=papers">Open Explorer</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <ProjectSection
                title={getProjectTypeLabelPlural(false)}
                description="Projects that read like thematic reviews or maintained literature modules."
                projects={curatedProjects}
              />
              <ProjectSection
                title={getProjectTypeLabelPlural(true)}
                description="Projects captured directly from a Research query and ready for further synthesis."
                projects={draftProjects}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
