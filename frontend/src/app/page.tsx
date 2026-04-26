"use client";

import { Suspense, useMemo, useState, type ComponentType, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import {
  ArrowRight,
  Compass,
  Download,
  FolderOpen,
  Microscope,
  Search,
} from "lucide-react";
import {
  GET_STATS,
  GET_PAPERS,
  GET_IDEAS,
  GET_PROJECTS,
} from "@/lib/queries";
import type { Stats, Idea, Project } from "@/lib/types";
import { sortProjectsByUpdatedAt } from "@/lib/projects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WhatsNewCard } from "@/components/dashboard/whats-new";
import { TopPapers } from "@/components/dashboard/top-papers";
import { ActiveIdeas } from "@/components/dashboard/active-ideas";
import { PersonalizedFeed } from "@/components/dashboard/personalized-feed";
import { appConfig } from "@/lib/app-config";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import { useI18n } from "@/lib/i18n/locale-context";

interface PaperItem {
  paperId: string;
  title: string | null;
  year: number | null;
  averageScore: number | null;
  fields: string[];
}

function MetricLink({
  href,
  label,
  value,
  title,
}: {
  href: string;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="rounded-2xl border border-border bg-background/80 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </Link>
  );
}

function ActionLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-12 items-center justify-between rounded-2xl border border-border bg-background/80 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-primary" style={{ strokeWidth: 1.75 }} />
        {label}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-muted" />
          <div className="h-96 animate-pulse rounded-2xl border border-border bg-muted" />
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

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/research?q=${encodeURIComponent(q)}`);
    }
  }

  const { data: statsData, loading: statsLoading, error: statsError } = useQuery<{
    stats: Stats;
  }>(GET_STATS);

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

  const { data: projectsData, error: projectsError } = useQuery<{
    projects: Project[];
  }>(GET_PROJECTS);

  const featuredProject = useMemo(() => {
    const projects = projectsData?.projects ?? [];
    if (projects.length === 0) return null;
    const sortedProjects = sortProjectsByUpdatedAt(projects);
    return sortedProjects.find((project) => project.originType !== "research") ?? sortedProjects[0];
  }, [projectsData]);

  const anyError = statsError || papersError || ideasError || projectsError;
  const combinedErrorMessage = collectErrorMessages([
    statsError,
    papersError,
    ideasError,
    projectsError,
  ]);
  const stats = statsData?.stats;
  const totalPapers = stats?.totalPapers ?? 0;
  const isEmptyCorpus = !statsLoading && totalPapers === 0;

  return (
    <div className="animate-in space-y-6">
      {anyError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">{t("dashboard.errorTitle")}</p>
          {combinedErrorMessage ? (
            <p className="mt-1 text-xs text-red-600">{combinedErrorMessage}</p>
          ) : null}
        </div>
      )}

      {isEmptyCorpus && (
        <Card className="paper-panel rounded-[1.35rem] border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("dashboard.emptyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/setup">{t("dashboard.actions.openSetup")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/pipeline">{t("dashboard.actions.openPipeline")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <form
          onSubmit={handleSearch}
          className="paper-panel flex min-w-0 flex-col gap-3 rounded-[1.35rem] p-3 sm:flex-row"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-background/80 px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("dashboard.searchPlaceholder")}
              className="h-12 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <Button type="submit" className="h-12 rounded-2xl px-5">
            {t("dashboard.actions.searchCorpus")}
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
          <ActionLink href="/pipeline" label={t("dashboard.actions.openPipeline")} icon={Download} />
          <ActionLink href="/research" label={t("dashboard.actions.topicWorkspace")} icon={Microscope} />
          <ActionLink href="/explorer" label={t("dashboard.actions.evidenceExplorer")} icon={Compass} />
          <ActionLink
            href={featuredProject ? `/projects/${featuredProject.slug}` : "/projects"}
            label={t("dashboard.actions.dossiers")}
            icon={FolderOpen}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricLink
          href="/library"
          label={t("dashboard.mobileStats.papers")}
          value={stats?.totalPapers?.toLocaleString(locale) ?? "..."}
          title={t("dashboard.signals.indexedPapers", { label: appConfig.corpusLabel })}
        />
        <MetricLink
          href="/explorer?tab=atoms"
          label={t("dashboard.mobileStats.atoms")}
          value={stats?.totalAtoms?.toLocaleString(locale) ?? "..."}
          title={t("dashboard.signals.atomDescription")}
        />
        <MetricLink
          href="/ideas"
          label={t("dashboard.mobileStats.ideas")}
          value={stats?.totalIdeas?.toLocaleString(locale) ?? "..."}
        />
        <MetricLink
          href={featuredProject ? `/projects/${featuredProject.slug}` : "/projects"}
          label={t("dashboard.signals.leadDossier")}
          value={featuredProject?.title ?? t("dashboard.signals.noDossier")}
        />
      </section>

      <section className="space-y-6">
        <WhatsNewCard />
        <TopPapers papers={papersData?.papers?.items} loading={papersLoading} />
        <PersonalizedFeed />
        <ActiveIdeas ideas={ideasData?.ideas} loading={ideasLoading} />
      </section>
    </div>
  );
}
