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

      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of the NBER Research Knowledge Base
        </p>
      </div>

      {/* Compact entry-point cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/latest"
          className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-violet-200 hover:bg-violet-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock3 className="h-4 w-4 text-violet-600" />
            Latest Research
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-violet-700" />
        </Link>

        <Link
          href="/research"
          className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Microscope className="h-4 w-4 text-blue-600" />
            Research
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-blue-700" />
        </Link>

        <Link
          href="/explorer"
          className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Compass className="h-4 w-4 text-emerald-600" />
            Explorer
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-emerald-700" />
        </Link>

        <Link
          href={featuredProject ? `/projects/${featuredProject.slug}` : "/projects"}
          className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-amber-200 hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FolderOpen className="h-4 w-4 text-amber-700" />
            Projects
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-amber-700" />
        </Link>
      </div>

      <Tabs defaultValue="today" className="space-y-6">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="analytics">Corpus Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          {/* Hero search section */}
          <div className="rounded-xl border bg-gradient-to-r from-blue-50 to-indigo-50 p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">What are you researching?</h2>
            <p className="text-sm text-muted-foreground mb-4">Search across 14,000+ NBER papers, methods, mechanisms, and datasets</p>
            <form onSubmit={handleSearch} className="mx-auto max-w-xl flex gap-2">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="e.g., effect of AI on labor markets, minimum wage, DID methods..."
                className="h-12 text-base"
              />
              <Button type="submit" size="lg">Search</Button>
            </form>
          </div>

          {/* What's New */}
          <WhatsNewCard />

          {/* Personalized Feed */}
          <PersonalizedFeed />

          {/* Featured project */}
          {projectsLoading ? (
            <FeaturedProjectSkeleton />
          ) : featuredProject ? (
            <FeaturedProjectSection project={featuredProject} />
          ) : (
            <Card className="rounded-xl border border-dashed shadow-sm">
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

          {/* Active Ideas */}
          <ActiveIdeas ideas={ideasData?.ideas} loading={ideasLoading} />

          {/* Top Papers */}
          <TopPapers
            papers={papersData?.papers?.items}
            loading={papersLoading}
          />
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
