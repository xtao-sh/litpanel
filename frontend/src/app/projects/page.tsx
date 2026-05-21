"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import {
  ArrowRight,
  FolderOpen,
  Microscope,
  Search,
} from "lucide-react";

import { GET_PROJECTS } from "@/lib/queries";
import type { Project } from "@/lib/types";
import {
  isResearchDraft,
  sortProjectsByUpdatedAt,
} from "@/lib/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/locale-context";

function formatUpdatedAt(value: string, locale: string, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US");
}

function humanizeProjectValue(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getProjectTypeLabel(project: Pick<Project, "originType">, t: (key: string) => string): string {
  return isResearchDraft(project) ? t("projects.types.researchDraft") : t("projects.types.curatedReview");
}

function getProjectTypeLabelPlural(isDraft: boolean, t: (key: string) => string): string {
  return isDraft ? t("projects.types.researchDrafts") : t("projects.types.curatedReviews");
}

function getProjectStatusLabel(status: string | null | undefined, t: (key: string) => string): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return t("projects.status.unknown");
  if (normalized === "draft") return t("projects.status.draft");
  if (normalized === "active") return t("projects.status.active");
  if (normalized === "published") return t("projects.status.published");
  if (normalized === "archived") return t("projects.status.archived");
  return humanizeProjectValue(normalized);
}

function getProjectScopeLabel(scopeType: string | null | undefined, t: (key: string) => string): string {
  const normalized = (scopeType ?? "").trim().toLowerCase();
  if (!normalized) return t("projects.scope.general");
  if (normalized === "curated_paper_set") return t("projects.scope.curatedPaperSet");
  return humanizeProjectValue(normalized);
}

function ProjectsSkeleton() {
  return (
    <div className="space-y-8">
      <Card className="lp-card rounded-[var(--r-md)] shadow-none">
        <CardHeader className="pb-3">
          <Skeleton className="h-7 w-64" />
        </CardHeader>
        <CardContent className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="lp-card rounded-[var(--r-md)] shadow-none">
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
          <Card key={index} className="lp-card rounded-[var(--r-md)] shadow-none">
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
    <Card className="lp-card rounded-[var(--r-md)] shadow-none">
      <CardHeader className="pb-2">
        <p className="section-kicker">{title}</p>
      </CardHeader>
      <CardContent>
        <p className="font-display text-[2.3rem] text-[var(--ink)]">{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-4)]">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const { locale, t } = useI18n();

  return (
    <Card className="lp-card rounded-[var(--r-md)] shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--forest-soft)] px-2 py-1 text-xs font-medium text-[var(--forest)]">
                {t("projects.card.paperCount", { count: project.paperCount.toLocaleString(locale) })}
              </span>
              <span className="rounded-full bg-[var(--paper-2)] px-2 py-1 text-xs font-medium text-[var(--ink-4)]">
                {getProjectStatusLabel(project.status, t)}
              </span>
              <span className="rounded-full bg-[var(--forest-soft)] px-2 py-1 text-xs font-medium text-[var(--forest)]">
                {getProjectTypeLabel(project, t)}
              </span>
              <span className="rounded-full bg-[var(--paper-2)] px-2 py-1 text-xs font-medium text-[var(--ink-4)]">
                {getProjectScopeLabel(project.scopeType, t)}
              </span>
            </div>
            <div>
              <Link
                href={`/projects/${project.slug}`}
                className="font-display text-[1.45rem] text-[var(--ink)] transition-colors hover:text-[var(--forest)]"
              >
                {project.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
                {project.description || t("projects.card.noDescription")}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-[var(--ink-4)]">
            {t("projects.card.updated", {
              date: formatUpdatedAt(project.updatedAt, locale, t("projects.card.recently")),
            })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {project.originQuery && (
          <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper-2)] px-3 py-2 text-sm text-[var(--ink-4)]">
            <span className="font-medium text-[var(--ink)]">{t("projects.card.sourceQuery")}:</span> &ldquo;{project.originQuery}&rdquo;
          </div>
        )}

        {project.originFiltersSummary && (
          <p className="text-sm text-[var(--ink-4)]">
            <span className="font-medium text-[var(--ink)]">{t("projects.card.filters")}:</span> {project.originFiltersSummary}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/projects/${project.slug}`}
            className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            {t("projects.nav.overview")}
          </Link>
          <Link
            href={`/projects/${project.slug}/themes`}
            className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            {t("projects.nav.themes")}
          </Link>
          <Link
            href={`/projects/${project.slug}/methods`}
            className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            {t("projects.nav.methods")}
          </Link>
          <Link
            href={`/projects/${project.slug}/gaps`}
            className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            {t("projects.nav.gaps")}
          </Link>
          <Link
            href={`/projects/${project.slug}/matrix`}
            className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          >
            {t("projects.nav.matrix")}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/projects/${project.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--forest)] hover:text-[var(--forest)]/90"
          >
            {t("projects.card.openProject")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {project.originQuery && (
            <Link
              href={`/research?q=${encodeURIComponent(project.originQuery)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-4)] hover:text-[var(--ink)]"
            >
              {t("projects.card.reopenSourceResearch")}
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
  const { t } = useI18n();
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="section-kicker">{t("projects.sections.kicker")}</p>
        <h3 className="font-display text-[2rem] text-[var(--ink)]">{title}</h3>
        <p className="text-sm text-[var(--ink-4)]">{description}</p>
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
  const { locale, t } = useI18n();
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
      <div>
        <Card className="lp-card rounded-[var(--r-md)] shadow-none">
          <CardHeader className="pb-4">
            <p className="section-kicker">{t("projects.header.kicker")}</p>
            <CardTitle className="font-display text-[clamp(2.6rem,4.4vw,4.2rem)] text-[var(--ink)]">
              {t("projects.header.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/research">
                <Microscope className="mr-1.5 h-3.5 w-3.5" />
                {t("projects.header.startResearch")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/explorer?tab=papers">
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {t("projects.header.browseExplorer")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {loading && <ProjectsSkeleton />}

      {error && (
        <div className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] p-4 text-sm text-[#8a3318]">
          <p className="font-medium">{t("projects.error.title")}</p>
          <p className="mt-1 text-xs text-[#8a3318]">
            {collectErrorMessages([error]) || t("projects.error.body")}
          </p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title={t("projects.summary.projects")}
              value={sortedProjects.length.toLocaleString(locale)}
              detail={t("projects.summary.projectsDetail")}
            />
            <SummaryCard
              title={getProjectTypeLabelPlural(false, t)}
              value={curatedProjects.length.toLocaleString(locale)}
              detail={t("projects.summary.curatedDetail")}
            />
            <SummaryCard
              title={getProjectTypeLabelPlural(true, t)}
              value={draftProjects.length.toLocaleString(locale)}
              detail={t("projects.summary.draftDetail")}
            />
            <SummaryCard
              title={t("projects.summary.papersCovered")}
              value={totalPapers.toLocaleString(locale)}
              detail={t("projects.summary.papersDetail")}
            />
          </div>

          {sortedProjects.length === 0 ? (
            <div className="lp-card rounded-[var(--r-md)] border-dashed p-8 text-center">
              <FolderOpen className="mx-auto h-10 w-10 text-[var(--ink-4)]/50" />
              <h3 className="mt-3 text-base font-semibold text-[var(--ink)]">
                {t("projects.empty.title")}
              </h3>
              <p className="mt-2 text-sm text-[var(--ink-4)]">
                {t("projects.empty.body")}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/research">{t("projects.empty.openResearch")}</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/explorer?tab=papers">{t("projects.empty.openExplorer")}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <ProjectSection
                title={getProjectTypeLabelPlural(false, t)}
                description={t("projects.sections.curatedDescription")}
                projects={curatedProjects}
              />
              <ProjectSection
                title={getProjectTypeLabelPlural(true, t)}
                description={t("projects.sections.draftDescription")}
                projects={draftProjects}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
