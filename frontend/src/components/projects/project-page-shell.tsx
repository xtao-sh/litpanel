"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@apollo/client/react";
import { ArrowLeft, ArrowRight, GitBranch } from "lucide-react";

import { GET_PROJECT } from "@/lib/queries";
import type { Project } from "@/lib/types";
import { buildProjectGraphHref } from "@/lib/navigation";
import {
  getProjectScopeLabel,
  getProjectStatusLabel,
  getProjectTypeLabel,
} from "@/lib/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type ProjectTabKey = "overview" | "dossier" | "chronology" | "themes" | "methods" | "gaps" | "matrix";

interface ProjectPageShellProps {
  slug: string;
  activeTab: ProjectTabKey;
  children: (project: Project) => ReactNode;
}

const PROJECT_TABS: { key: ProjectTabKey; label: string; suffix: string }[] = [
  { key: "overview", label: "Overview", suffix: "" },
  { key: "dossier", label: "Dossier", suffix: "/dossier" },
  { key: "chronology", label: "Chronology", suffix: "/chronology" },
  { key: "themes", label: "Themes", suffix: "/themes" },
  { key: "methods", label: "Methods", suffix: "/methods" },
  { key: "gaps", label: "Gaps", suffix: "/gaps" },
  { key: "matrix", label: "Matrix", suffix: "/matrix" },
];

function ProjectSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function formatUpdatedAt(value: string) {
  if (!value) return "Recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

export function ProjectPageShell({
  slug,
  activeTab,
  children,
}: ProjectPageShellProps) {
  const { data, loading, error } = useQuery<{ project: Project | null }>(GET_PROJECT, {
    variables: { slug },
  });

  const project = data?.project;

  if (loading) {
    return <ProjectSkeleton />;
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Projects
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Project not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Projects
      </Link>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="space-y-3">
          <p className="section-kicker">Project dossier</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              {project.paperCount} papers
            </span>
            <span className="rounded-full bg-[color:oklch(var(--accent)/0.45)] px-2 py-1 text-xs font-medium text-muted-foreground">
              {getProjectStatusLabel(project.status)}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              {getProjectTypeLabel(project)}
            </span>
            <span className="rounded-full bg-[color:oklch(var(--accent)/0.45)] px-2 py-1 text-xs font-medium text-muted-foreground">
              {getProjectScopeLabel(project.scopeType)}
            </span>
          </div>
          <h1 className="font-display text-[clamp(2.6rem,4.3vw,4rem)] text-foreground">
            {project.title}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {project.description || "No description provided."}
          </p>
        </div>

        <Card className="paper-panel rounded-[1.75rem] shadow-none">
          <CardHeader className="pb-4">
            <p className="section-kicker">Context rail</p>
            <CardTitle className="font-display text-[1.65rem] text-foreground">Project Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="space-y-1">
              <p>
                <span className="font-medium text-foreground">Updated:</span>{" "}
                {formatUpdatedAt(project.updatedAt)}
              </p>
              {project.sourcePaperCount != null && (
                <p>
                  <span className="font-medium text-foreground">Captured set:</span>{" "}
                  {project.sourcePaperCount} paper{project.sourcePaperCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {project.originQuery && (
              <div className="space-y-1">
                <p className="font-medium text-foreground">Source Query</p>
                <p>&ldquo;{project.originQuery}&rdquo;</p>
              </div>
            )}

            {project.originFiltersSummary && (
              <div className="space-y-1">
                <p className="font-medium text-foreground">Source Filters</p>
                <p>{project.originFiltersSummary}</p>
              </div>
            )}

            {project.originQuery && (
              <Link
                href={`/research?q=${encodeURIComponent(project.originQuery)}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/90"
              >
                Reopen source research
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}

            {project.paperIds.length > 0 && (
              <Link
                href={buildProjectGraphHref({
                  paperIds: project.paperIds,
                  projectSlug: project.slug,
                  projectTitle: project.title,
                  tab: activeTab,
                })}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/90"
              >
                Open project graph
                <GitBranch className="h-3.5 w-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="paper-panel flex flex-wrap gap-2 rounded-[1.4rem] p-2.5">
        {PROJECT_TABS.map((tab) => {
          const href = `/projects/${project.slug}${tab.suffix}`;
          const isActive = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children(project)}
    </div>
  );
}
