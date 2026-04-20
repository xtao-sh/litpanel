"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import {
  ArrowRight,
  Clock3,
  Compass,
  FileSearch,
  FolderOpen,
  GitBranchPlus,
  Microscope,
  Sparkles,
} from "lucide-react";
import {
  GET_STATS,
  GET_FIELD_OVERVIEW,
  GET_YEAR_DISTRIBUTION,
  GET_PAPERS,
  GET_IDEAS,
  GET_GAP_ANALYSIS,
  GET_TRENDING_TOPICS,
  GET_PROJECTS,
} from "@/lib/queries";
import type { Stats, Idea, GapAnalysis, Project, TrendingTopic } from "@/lib/types";
import { getDashboardProjectLabel, sortProjectsByUpdatedAt } from "@/lib/projects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhatsNewCard } from "@/components/dashboard/whats-new";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { YearChart } from "@/components/dashboard/year-chart";
import { FieldChart } from "@/components/dashboard/field-chart";
import { TopPapers } from "@/components/dashboard/top-papers";
import { ActiveIdeas } from "@/components/dashboard/active-ideas";
import { AtomBreakdown } from "@/components/dashboard/atom-breakdown";
import { GapAnalysisCard } from "@/components/dashboard/gap-analysis";
import { TrendingTopics } from "@/components/dashboard/trending-topics";
import { PersonalizedFeed } from "@/components/dashboard/personalized-feed";
import { MethodFieldHeatmap } from "@/components/dashboard/method-field-heatmap";

interface FieldOverviewItem {
  field: string;
  paperCount: number;
  atomCount: number;
  avgScore: number;
}

interface YearDistItem {
  year: number;
  count: number;
}

interface PaperItem {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
}

function formatUpdatedAt(value: string) {
  if (!value) return "Recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function FeaturedProjectSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-72" />
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
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    </div>
  );
}

function FeaturedProjectSection({ project }: { project: Project }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">
              {getDashboardProjectLabel(project)}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">
              {project.paperCount} papers
            </span>
            <span className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">
              Updated {formatUpdatedAt(project.updatedAt)}
            </span>
          </div>
          <CardTitle className="text-xl font-semibold text-foreground">
            {project.title}
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {project.description || "Open the project to see its thematic overview, methods, gaps, and comparison matrix."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.originQuery && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Source query:</span> &ldquo;{project.originQuery}&rdquo;
            </div>
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
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${project.slug}`}>
                Open project
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            {project.originQuery && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/research?q=${encodeURIComponent(project.originQuery)}`}>
                  Reopen source research
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Project Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>Start in Research when you need to stabilize a topic and corpus.</p>
          </div>
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>Use Themes and Gaps when the task is synthesis, not just retrieval.</p>
          </div>
          <div className="flex items-start gap-2">
            <GitBranchPlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>Open Matrix when you need side-by-side comparison across the included papers.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h2>
            <p className="mt-1 text-sm text-muted-foreground">Overview of the NBER Research Knowledge Base</p>
          </div>
          <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/research?q=${encodeURIComponent(q)}`);
    }
  }

  const { data: statsData, loading: statsLoading, error: statsError } = useQuery<{
    stats: Stats;
  }>(GET_STATS);

  const { data: fieldData, loading: fieldLoading, error: fieldError } = useQuery<{
    fieldOverview: FieldOverviewItem[];
  }>(GET_FIELD_OVERVIEW);

  const { data: yearData, loading: yearLoading, error: yearError } = useQuery<{
    yearDistribution: YearDistItem[];
  }>(GET_YEAR_DISTRIBUTION);

  const { data: papersData, loading: papersLoading, error: papersError } = useQuery<{
    papers: { items: PaperItem[]; total: number };
  }>(GET_PAPERS, {
    variables: {
      filter: { hasCard: true },
      sort: "SCORE_DESC",
      limit: 10,
    },
  });

  const { data: ideasData, loading: ideasLoading, error: ideasError } = useQuery<{
    ideas: Idea[];
  }>(GET_IDEAS);

  const { data: gapData, loading: gapLoading, error: gapError } = useQuery<{
    gapAnalysis: GapAnalysis;
  }>(GET_GAP_ANALYSIS, {
    variables: { limit: 20 },
  });

  const { data: trendingData, loading: trendingLoading, error: trendingError } = useQuery<{
    trendingTopics: TrendingTopic[];
  }>(GET_TRENDING_TOPICS, {
    variables: { window: 3, limit: 20 },
  });

  const { data: projectsData, loading: projectsLoading, error: projectsError } = useQuery<{
    projects: Project[];
  }>(GET_PROJECTS);

  const featuredProject = useMemo(() => {
    const projects = projectsData?.projects ?? [];
    if (projects.length === 0) {
      return null;
    }

    const sortedProjects = sortProjectsByUpdatedAt(projects);

    return sortedProjects.find((project) => project.originType !== "research") ?? sortedProjects[0];
  }, [projectsData]);

  const anyError =
    statsError || fieldError || yearError || papersError || ideasError || gapError || trendingError || projectsError;

  return (
    <div className="animate-in space-y-6">
      {/* Error banner */}
      {anyError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Some data failed to load. Please refresh the page.</p>
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="space-y-6">
          <div className="space-y-3">
            <p className="section-kicker">Research Dashboard</p>
            <h2 className="font-display text-[clamp(2rem,5vw,5.4rem)] text-foreground">
              Follow live questions, then turn them into dossiers.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              This workspace is built for researchers who need to track what is new, follow a method or dataset across papers,
              and turn scattered evidence into a stable topic narrative.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="paper-panel flex max-w-2xl flex-col gap-3 rounded-[1.6rem] p-3 sm:flex-row"
          >
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Try a live question: hospital mergers, AI and labor, staggered DID..."
              className="h-14 border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="lg" className="h-12 rounded-2xl px-6">
              Search the corpus
            </Button>
          </form>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Link
              href="/latest"
              className="group paper-panel flex items-center justify-between rounded-[1.25rem] px-4 py-3 transition-colors hover:bg-[color:oklch(var(--accent)/0.5)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="group-hover:scale-105 transition-transform">
                  <Clock3 className="h-4 w-4 text-violet-700" />
                </span>
                Latest Research
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-violet-700" />
            </Link>

            <Link
              href="/research"
              className="group paper-panel flex items-center justify-between rounded-[1.25rem] px-4 py-3 transition-colors hover:bg-[color:oklch(var(--accent)/0.5)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="group-hover:scale-105 transition-transform">
                  <Microscope className="h-4 w-4 text-primary" />
                </span>
                Topic Workspace
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
            </Link>

            <Link
              href="/explorer"
              className="group paper-panel flex items-center justify-between rounded-[1.25rem] px-4 py-3 transition-colors hover:bg-[color:oklch(var(--accent)/0.5)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="group-hover:scale-105 transition-transform">
                  <Compass className="h-4 w-4 text-emerald-700" />
                </span>
                Evidence Explorer
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-700" />
            </Link>

            <Link
              href={featuredProject ? `/projects/${featuredProject.slug}` : "/projects"}
              className="group paper-panel flex items-center justify-between rounded-[1.25rem] px-4 py-3 transition-colors hover:bg-[color:oklch(var(--accent)/0.5)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="group-hover:scale-105 transition-transform">
                  <FolderOpen className="h-4 w-4 text-amber-700" />
                </span>
                Dossiers
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-amber-700" />
            </Link>
          </div>
        </section>

        <aside className="hidden xl:block paper-panel rounded-[1.75rem] p-5">
          <div className="space-y-4">
            <div>
              <p className="section-kicker">Current signals</p>
              <h3 className="font-display text-[1.8rem] text-foreground">What deserves attention now</h3>
            </div>

            <div className="ink-rule" />

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Corpus</p>
                <p className="mt-1 font-display text-[2rem] text-foreground">
                  {statsData?.stats?.totalPapers?.toLocaleString() ?? "…"}
                </p>
                <p className="text-sm text-muted-foreground">Indexed NBER papers in the working library.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Atoms</p>
                <p className="mt-1 font-display text-[2rem] text-foreground">
                  {statsData?.stats?.totalAtoms?.toLocaleString() ?? "…"}
                </p>
                <p className="text-sm text-muted-foreground">Methods, mechanisms, datasets, and puzzles extracted for navigation.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Lead dossier</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {featuredProject?.title ?? "No dossier yet"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {featuredProject ? "Open the most recently updated review-ready project." : "Promote a stable paper set from Research into Projects."}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile/tablet stat pills - visible below xl */}
      <div className="flex flex-wrap gap-3 xl:hidden">
        <div className="paper-panel rounded-full px-4 py-2 text-sm">
          <span className="text-muted-foreground">Papers</span>{' '}
          <span className="font-semibold">{statsData?.stats?.totalPapers?.toLocaleString() ?? '...'}</span>
        </div>
        <div className="paper-panel rounded-full px-4 py-2 text-sm">
          <span className="text-muted-foreground">Atoms</span>{' '}
          <span className="font-semibold">{statsData?.stats?.totalAtoms?.toLocaleString() ?? '...'}</span>
        </div>
        <div className="paper-panel rounded-full px-4 py-2 text-sm">
          <span className="text-muted-foreground">Ideas</span>{' '}
          <span className="font-semibold">{statsData?.stats?.totalIdeas?.toLocaleString() ?? '...'}</span>
        </div>
      </div>

      <Tabs defaultValue="today" className="space-y-6">
        <TabsList className="h-auto rounded-full border border-border bg-[color:oklch(var(--card)/0.86)] p-1">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="analytics">Corpus Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_360px]">
            <div className="space-y-6">
              {projectsLoading ? (
                <FeaturedProjectSkeleton />
              ) : featuredProject ? (
                <FeaturedProjectSection project={featuredProject} />
              ) : (
                <Card className="paper-panel rounded-[1.5rem] border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Projects</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>No project has been published yet. Start in Research, then promote a stable paper set into Projects.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href="/research">Open Research</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/projects">Open Projects</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <TopPapers
                papers={papersData?.papers?.items}
                loading={papersLoading}
              />

              <PersonalizedFeed />
            </div>

            <div className="space-y-6">
              <WhatsNewCard />
              <ActiveIdeas ideas={ideasData?.ideas} loading={ideasLoading} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {/* Stats Cards */}
          <StatsCards stats={statsData?.stats} loading={statsLoading} />

          {/* Charts */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <YearChart
              data={yearData?.yearDistribution}
              loading={yearLoading}
            />
            <FieldChart
              data={fieldData?.fieldOverview}
              loading={fieldLoading}
            />
          </div>

          {/* Trending Topics */}
          <TrendingTopics
            data={trendingData?.trendingTopics}
            loading={trendingLoading}
          />

          {/* Method x Field Heatmap */}
          <MethodFieldHeatmap />

          {/* Gap Analysis */}
          <GapAnalysisCard data={gapData?.gapAnalysis} loading={gapLoading} />

          {/* Atom type breakdown */}
          <AtomBreakdown stats={statsData?.stats} loading={statsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
