"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import {
  ArrowRight,
  Clock3,
  Compass,
  FolderOpen,
  Microscope,
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
import { sortProjectsByUpdatedAt } from "@/lib/projects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { appConfig } from "@/lib/app-config";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import { useI18n } from "@/lib/i18n/locale-context";

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

export default function DashboardPage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("dashboard.fallbackTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.fallbackBody", { appName: appConfig.appName })}</p>
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
  const { locale, t } = useI18n();
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

  const { data: projectsData, error: projectsError } = useQuery<{
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
  const combinedErrorMessage = collectErrorMessages([
    statsError,
    fieldError,
    yearError,
    papersError,
    ideasError,
    gapError,
    trendingError,
    projectsError,
  ]);
  const totalPapers = statsData?.stats?.totalPapers ?? 0;
  const isEmptyCorpus = !statsLoading && totalPapers === 0;

  return (
    <div className="animate-in space-y-6">
      {/* Error banner */}
      {anyError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">{t("dashboard.errorTitle")}</p>
          {combinedErrorMessage ? (
            <p className="mt-1 text-xs text-red-600">{combinedErrorMessage}</p>
          ) : null}
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="space-y-6">
          {isEmptyCorpus && (
            <Card className="paper-panel rounded-[1.6rem] border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{t("dashboard.emptyTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {t("dashboard.emptyBody", { appName: appConfig.appName })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/setup">{t("dashboard.actions.openSetup")}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/pipeline">{t("dashboard.actions.openPipeline")}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/research">{t("dashboard.actions.openResearch")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <form
            onSubmit={handleSearch}
            className="paper-panel flex max-w-2xl flex-col gap-3 rounded-[1.6rem] p-3 sm:flex-row"
          >
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("dashboard.searchPlaceholder")}
              className="h-14 border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="lg" className="h-12 rounded-2xl px-6">
              {t("dashboard.actions.searchCorpus")}
            </Button>
          </form>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href="/latest"
              className="group paper-panel flex items-center justify-between rounded-[1.25rem] px-4 py-3 transition-colors hover:bg-[color:oklch(var(--accent)/0.5)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="group-hover:scale-105 transition-transform">
                  <Clock3 className="h-4 w-4 text-violet-700" />
                </span>
                {t("dashboard.actions.latestResearch")}
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
                {t("dashboard.actions.topicWorkspace")}
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
                {t("dashboard.actions.evidenceExplorer")}
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
                {t("dashboard.actions.dossiers")}
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-amber-700" />
            </Link>
          </div>
        </section>

        <aside className="hidden xl:block paper-panel rounded-[1.75rem] p-5">
          <div className="space-y-4">
            <div>
              <p className="section-kicker">{t("dashboard.signals.kicker")}</p>
              <h3 className="font-display text-[1.8rem] text-foreground">{t("dashboard.signals.title")}</h3>
            </div>

            <div className="ink-rule" />

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <Link
                href="/library"
                className="group -mx-2 rounded-[1rem] px-2 py-1.5 transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("dashboard.signals.corpus")}</p>
                <p className="mt-1 font-display text-[2rem] text-foreground transition-colors group-hover:text-primary">
                  {statsData?.stats?.totalPapers?.toLocaleString(locale) ?? "…"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.signals.indexedPapers", { label: appConfig.corpusLabel })}
                </p>
              </Link>
              <Link
                href="/explorer?tab=atoms"
                className="group -mx-2 rounded-[1rem] px-2 py-1.5 transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("dashboard.signals.atoms")}</p>
                <p className="mt-1 font-display text-[2rem] text-foreground transition-colors group-hover:text-primary">
                  {statsData?.stats?.totalAtoms?.toLocaleString(locale) ?? "…"}
                </p>
                <p className="text-sm text-muted-foreground">{t("dashboard.signals.atomDescription")}</p>
              </Link>
              <Link
                href={featuredProject ? `/projects/${featuredProject.slug}` : "/projects"}
                className="group -mx-2 rounded-[1rem] px-2 py-1.5 transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("dashboard.signals.leadDossier")}</p>
                <p className="mt-1 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                  {featuredProject?.title ?? t("dashboard.signals.noDossier")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {featuredProject ? t("dashboard.signals.openDossier") : t("dashboard.signals.promoteDossier")}
                </p>
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile/tablet stat pills - visible below xl */}
      <div className="flex flex-wrap gap-3 xl:hidden">
        <div className="paper-panel rounded-full px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("dashboard.mobileStats.papers")}</span>{" "}
          <span className="font-semibold">{statsData?.stats?.totalPapers?.toLocaleString(locale) ?? "..."}</span>
        </div>
        <div className="paper-panel rounded-full px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("dashboard.mobileStats.atoms")}</span>{" "}
          <span className="font-semibold">{statsData?.stats?.totalAtoms?.toLocaleString(locale) ?? "..."}</span>
        </div>
        <div className="paper-panel rounded-full px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("dashboard.mobileStats.ideas")}</span>{" "}
          <span className="font-semibold">{statsData?.stats?.totalIdeas?.toLocaleString(locale) ?? "..."}</span>
        </div>
      </div>

      <Tabs defaultValue="today" className="space-y-6">
        <TabsList className="h-auto rounded-full border border-border bg-[color:oklch(var(--card)/0.86)] p-1">
          <TabsTrigger value="today">{t("dashboard.tabs.today")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("dashboard.tabs.analytics")}</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <WhatsNewCard />

          <TopPapers
            papers={papersData?.papers?.items}
            loading={papersLoading}
          />

          <ActiveIdeas ideas={ideasData?.ideas} loading={ideasLoading} />

          <PersonalizedFeed />
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
