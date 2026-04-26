"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { ArrowRight, Compass, Microscope } from "lucide-react";

import { TrendingTopics } from "@/components/dashboard/trending-topics";
import { YearChart } from "@/components/dashboard/year-chart";
import { SaturationCard } from "@/components/research/saturation-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildCompareHref,
  buildEntityGraphHref,
  buildExplorerPaperHref,
  buildResearchGraphHref,
  buildResearchHref,
} from "@/lib/navigation";
import { GET_PAPERS, GET_TRENDING_TOPICS, GET_WHATS_NEW, GET_YEAR_DISTRIBUTION, RESEARCH_PAPERS } from "@/lib/queries";
import type { Paper, TrendingTopic, WhatsNew } from "@/lib/types";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import { useI18n } from "@/lib/i18n/locale-context";

interface YearDistItem {
  year: number;
  count: number;
}

const LATEST_RETURN_TO = "/latest";

type LatestTab = "dossier" | "newest" | "years";

interface ResearchPapersForTopicResult {
  researchPapers: {
    papers: { total: number; items: Paper[] };
    allPaperIds: string[];
  };
}

function formatGrowthRate(rate: number): string {
  const pct = Math.round(rate * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function TopicDiscoveryCard({
  title,
  description,
  topics,
  emptyMessage,
}: {
  title: string;
  description: string;
  topics: TrendingTopic[];
  emptyMessage: string;
}) {
  const { t } = useI18n();

  return (
    <Card className="paper-panel h-full rounded-[1.65rem] shadow-none">
      <CardHeader className="pb-4">
        <p className="section-kicker">{t("latest.topicCards.kicker")}</p>
        <CardTitle className="font-display text-[1.9rem] text-foreground">{title}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.length > 0 ? (
          topics.map((topic) => (
            <div
              key={`${topic.category}-${topic.name}`}
              className="rounded-[1.15rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.36)] px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display truncate text-[1.25rem] text-foreground">{topic.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-background/80 px-2 py-0.5">
                      {topic.category}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {formatGrowthRate(topic.growthRate)}
                    </span>
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-foreground">
                      {t("latest.topicCards.recent", { count: topic.recentCount })}
                    </span>
                    <span className="rounded-full bg-background/80 px-2 py-0.5">
                      {t("latest.topicCards.average", { value: topic.historicalAvg.toFixed(1) })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={buildExplorerPaperHref({ query: topic.name })}
                  className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  <Compass className="h-3 w-3" />
                  {t("latest.actions.relatedPapers")}
                </Link>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LatestPaperBuckets({
  papers,
  loading,
}: {
  papers: Paper[] | undefined;
  loading: boolean;
}) {
  const { t } = useI18n();
  const grouped = useMemo(() => {
    if (!papers) {
      return [];
    }

    const buckets = new Map<string, Paper[]>();
    for (const paper of papers) {
      const key = paper.year != null ? String(paper.year) : "Unknown";
      const current = buckets.get(key) ?? [];
      current.push(paper);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries()).sort(([a], [b]) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return Number(b) - Number(a);
    });
  }, [papers]);

  return (
    <Card className="paper-panel rounded-[1.7rem] shadow-none">
      <CardHeader className="pb-4">
        <p className="section-kicker">{t("latest.yearBuckets.kicker")}</p>
        <CardTitle className="font-display text-[2rem] text-foreground">{t("latest.yearBuckets.title")}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("latest.yearBuckets.body")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ))}
          </div>
        ) : grouped.length > 0 ? (
          grouped.map(([year, entries]) => (
            <div key={year} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-[1.35rem] text-foreground">
                    {year === "Unknown" ? t("latest.yearBuckets.unknown") : year}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {t("latest.yearBuckets.inPreview", { count: entries.length })}
                  </span>
                </div>
                {year !== "Unknown" && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildExplorerPaperHref({
                        query: "",
                        filters: {
                          yearMin: Number(year),
                          yearMax: Number(year),
                          hasCard: true,
                        },
                      })}
                      className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                    >
                      <Compass className="h-3 w-3" />
                      {t("latest.actions.openYearBatch")}
                    </Link>
                    {entries.length >= 2 && (
                      <Link
                        href={buildCompareHref({
                          paperIds: entries.slice(0, 4).map((paper) => paper.paperId),
                          source: "latest",
                          returnTo: LATEST_RETURN_TO,
                          context: t("latest.yearBuckets.recentBatchContext", { year }),
                        })}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                      >
                        {t("latest.actions.comparePreview")}
                      </Link>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {entries.slice(0, 4).map((paper) => (
                  <div
                    key={paper.paperId}
                    className="rounded-[1.15rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] px-4 py-4"
                  >
                    <Link
                      href={`/paper/${paper.paperId}`}
                      className="font-display text-[1.1rem] text-foreground transition-colors hover:text-primary"
                    >
                      {paper.title || paper.paperId}
                    </Link>
                    {paper.tldr && (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {paper.tldr}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {paper.fields.slice(0, 3).map((field) => (
                        <Link
                          key={field}
                          href={`/research?q=${encodeURIComponent(field)}`}
                          className="rounded-full bg-background/80 px-2 py-0.5 text-foreground transition-colors hover:bg-background"
                          title={field}
                        >
                          {field}
                        </Link>
                      ))}
                      {paper.averageScore != null && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                          {t("latest.yearBuckets.score", { score: paper.averageScore.toFixed(1) })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t("latest.yearBuckets.empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TopicDossierPanel({
  topics,
  selectedTopicName,
  onSelectTopic,
}: {
  topics: TrendingTopic[];
  selectedTopicName: string;
  onSelectTopic: (topicName: string) => void;
}) {
  const { t } = useI18n();
  const selectedTopic =
    topics.find((topic) => topic.name === selectedTopicName) ?? topics[0] ?? null;

  const { data, loading } = useQuery<ResearchPapersForTopicResult>(RESEARCH_PAPERS, {
    variables: {
      query: selectedTopic?.name ?? "",
      filters: null,
      sort: "YEAR_DESC",
      limit: 5,
      offset: 0,
    },
    skip: !selectedTopic,
  });

  const previewPapers = data?.researchPapers.papers.items ?? [];
  const allPaperIds = data?.researchPapers.allPaperIds ?? [];
  const totalPapers = data?.researchPapers.papers.total ?? 0;

  if (!selectedTopic) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
      <Card className="paper-panel rounded-[1.75rem] shadow-none">
        <CardHeader className="pb-4">
          <p className="section-kicker">{t("latest.dossier.kicker")}</p>
          <CardTitle className="font-display text-[2.1rem] text-foreground">{t("latest.dossier.title")}</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("latest.dossier.body")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => {
              const isActive = topic.name === selectedTopic.name;
              return (
                <button
                  key={`${topic.category}-${topic.name}`}
                  type="button"
                  onClick={() => onSelectTopic(topic.name)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-[color:oklch(var(--accent)/0.45)] text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.75)] hover:text-foreground"
                  }`}
                >
                  {topic.name}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.2rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("latest.dossier.momentum")}
              </p>
              <p className="font-display mt-2 text-[2rem] text-foreground">
                {formatGrowthRate(selectedTopic.growthRate)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("latest.dossier.momentumBody")}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("latest.dossier.recentCount")}
              </p>
              <p className="font-display mt-2 text-[2rem] text-foreground">
                {selectedTopic.recentCount}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("latest.dossier.recentCountBody")}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("latest.dossier.corpusMatch")}
              </p>
              <p className="font-display mt-2 text-[2rem] text-foreground">
                {loading ? "..." : totalPapers}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("latest.dossier.corpusMatchBody")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildExplorerPaperHref({ query: selectedTopic.name })}
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
            >
              <Compass className="h-3.5 w-3.5" />
              {t("latest.actions.relatedPapers")}
            </Link>
            <Link
              href={buildResearchGraphHref({
                query: selectedTopic.name,
                returnTo: LATEST_RETURN_TO,
                label: selectedTopic.name,
                source: "latest",
              })}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {t("latest.actions.openGraph")}
            </Link>
            {previewPapers.length >= 2 && (
              <Link
                href={buildCompareHref({
                  paperIds: previewPapers.slice(0, 4).map((paper) => paper.paperId),
                  source: "latest",
                  returnTo: LATEST_RETURN_TO,
                  context: selectedTopic.name,
                })}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
              >
                {t("latest.actions.comparePreview")}
              </Link>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{t("latest.dossier.previewPapers")}</p>
              <span className="text-xs text-muted-foreground">
                {loading ? t("latest.dossier.loading") : t("latest.dossier.shown", { count: previewPapers.length })}
              </span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-border px-3 py-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : previewPapers.length > 0 ? (
              previewPapers.slice(0, 3).map((paper) => (
                <div key={paper.paperId} className="rounded-[1.15rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.32)] px-4 py-4">
                  <Link
                    href={`/paper/${paper.paperId}?returnTo=${encodeURIComponent(LATEST_RETURN_TO)}`}
                    className="font-display text-[1.15rem] text-foreground transition-colors hover:text-primary"
                  >
                    {paper.title || paper.paperId}
                  </Link>
                  {paper.tldr && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {paper.tldr}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {paper.year != null && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                        {paper.year}
                      </span>
                    )}
                    {paper.fields.slice(0, 2).map((field) => (
                      <span key={field} className="rounded-full bg-background/80 px-2 py-0.5 text-foreground" title={field}>
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("latest.dossier.emptyPreview")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <SaturationCard searchQuery={selectedTopic.name} allPaperIds={allPaperIds} />
    </div>
  );
}

function LatestResearchContent() {
  const { t } = useI18n();
  const [selectedDossierTopicName, setSelectedDossierTopicName] = useState("");
  const [activeLatestTab, setActiveLatestTab] = useState<LatestTab>("dossier");
  const { data: whatsNewData, loading: whatsNewLoading, error: whatsNewError } = useQuery<{
    whatsNew: WhatsNew;
  }>(GET_WHATS_NEW, {
    variables: { limit: 12 },
  });

  const { data: trendingData, loading: trendingLoading, error: trendingError } = useQuery<{
    trendingTopics: TrendingTopic[];
  }>(GET_TRENDING_TOPICS, {
    variables: { window: 3, limit: 12 },
  });

  const { data: recentPapersData, loading: recentPapersLoading, error: recentPapersError } = useQuery<{
    papers: { items: Paper[]; total: number };
  }>(GET_PAPERS, {
    variables: {
      filter: { hasCard: true },
      sort: "YEAR_DESC",
      limit: 24,
    },
  });

  const { data: yearData, loading: yearLoading, error: yearError } = useQuery<{
    yearDistribution: YearDistItem[];
  }>(GET_YEAR_DISTRIBUTION);

  const anyError = whatsNewError || trendingError || recentPapersError || yearError;
  const combinedErrorMessage = collectErrorMessages([
    whatsNewError,
    trendingError,
    recentPapersError,
    yearError,
  ]);
  const recentMomentum = useMemo(() => {
    const allYears = (yearData?.yearDistribution ?? []).slice().sort((a, b) => a.year - b.year);
    return allYears.slice(-10);
  }, [yearData]);
  const whatsNew = whatsNewData?.whatsNew;
  const trendingTopics = trendingData?.trendingTopics;
  const recentPapers = recentPapersData?.papers.items;
  const topicBuckets = useMemo(() => {
    const topics = trendingTopics ?? [];
    const rising = topics
      .filter((topic) => topic.trend === "rising")
      .slice()
      .sort((a, b) => {
        if (b.recentCount !== a.recentCount) {
          return b.recentCount - a.recentCount;
        }
        return b.growthRate - a.growthRate;
      });
    const highMomentum = rising.slice(0, 4);
    const lowerCoverage = rising
      .filter((topic) => topic.recentCount <= 3 || topic.historicalAvg < 2)
      .slice(0, 4);
    const cooling = topics
      .filter((topic) => topic.trend === "declining")
      .slice()
      .sort((a, b) => a.growthRate - b.growthRate)
      .slice(0, 4);

    return {
      highMomentum,
      lowerCoverage,
      cooling,
    };
  }, [trendingTopics]);
  const dossierTopics = useMemo(() => {
    const seen = new Set<string>();
    const ordered = [
      ...topicBuckets.highMomentum,
      ...topicBuckets.lowerCoverage,
      ...topicBuckets.cooling,
    ];

    return ordered.filter((topic) => {
      if (seen.has(topic.name)) {
        return false;
      }
      seen.add(topic.name);
      return true;
    });
  }, [topicBuckets]);
  const latestTabs: Array<{ id: LatestTab; label: string; description: string }> = [
    {
      id: "dossier",
      label: t("latest.tabs.dossier"),
      description: t("latest.tabs.dossierBody"),
    },
    {
      id: "newest",
      label: t("latest.tabs.newest"),
      description: t("latest.tabs.newestBody"),
    },
    {
      id: "years",
      label: t("latest.tabs.years"),
      description: t("latest.tabs.yearsBody"),
    },
  ];

  return (
    <div className="animate-in space-y-6">
      {anyError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">{t("latest.errors.dataFailed")}</p>
          {combinedErrorMessage ? (
            <p className="mt-1 text-xs text-red-600">{combinedErrorMessage}</p>
          ) : null}
        </div>
      )}

      <div className="paper-panel rounded-[2rem] px-6 py-7 md:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="section-kicker">{t("latest.hero.kicker")}</span>
          {whatsNew && (
            <span className="rounded-full bg-[color:oklch(var(--accent)/0.45)] px-2.5 py-1 font-medium text-muted-foreground">
              {t("latest.hero.indexed", { count: whatsNew.totalPapers.toLocaleString() })}
            </span>
          )}
        </div>
        <h2 className="font-display mt-3 max-w-4xl text-[clamp(2.6rem,4.7vw,4.4rem)] text-foreground">
          {t("latest.hero.title")}
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {t("latest.hero.body")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/research"
            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <Microscope className="h-3.5 w-3.5" />
            {t("latest.actions.openResearch")}
          </Link>
          <Link
            href="/explorer"
            className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            <Compass className="h-3.5 w-3.5" />
            {t("latest.actions.openExplorer")}
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            {t("latest.actions.openProjects")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="ink-rule my-8" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="paper-panel rounded-[1.45rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">{t("latest.stats.liveFeed")}</p>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("latest.stats.newestBatch")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.35rem] text-foreground">
              {whatsNewLoading ? "..." : whatsNew?.latestPapersCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("latest.stats.newestBody")}
            </p>
          </CardContent>
        </Card>
        <Card className="paper-panel rounded-[1.45rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">{t("latest.stats.topicWatch")}</p>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("latest.stats.risingTopics")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.35rem] text-foreground">
              {trendingLoading ? "..." : trendingTopics?.filter((topic) => topic.trend === "rising").length ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("latest.stats.risingBody")}
            </p>
          </CardContent>
        </Card>
        <Card className="paper-panel rounded-[1.45rem] shadow-none">
          <CardHeader className="pb-2">
            <p className="section-kicker">{t("latest.stats.workingCorpus")}</p>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("latest.stats.deepReadRecentSet")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-[2.35rem] text-foreground">
              {recentPapersLoading ? "..." : recentPapers?.length ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("latest.stats.deepReadBody")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="ink-rule my-8" />

      <div className="grid gap-6 xl:grid-cols-3">
        <TopicDiscoveryCard
          title={t("latest.topicCards.highMomentumTitle")}
          description={t("latest.topicCards.highMomentumBody")}
          topics={topicBuckets.highMomentum}
          emptyMessage={t("latest.topicCards.highMomentumEmpty")}
        />
        <TopicDiscoveryCard
          title={t("latest.topicCards.lowerCoverageTitle")}
          description={t("latest.topicCards.lowerCoverageBody")}
          topics={topicBuckets.lowerCoverage}
          emptyMessage={t("latest.topicCards.lowerCoverageEmpty")}
        />
        <TopicDiscoveryCard
          title={t("latest.topicCards.coolingTitle")}
          description={t("latest.topicCards.coolingBody")}
          topics={topicBuckets.cooling}
          emptyMessage={t("latest.topicCards.coolingEmpty")}
        />
      </div>

      <div className="ink-rule my-8" />

      <div className="paper-panel rounded-[1.8rem] p-3">
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {latestTabs.map((tab) => {
            const isActive = activeLatestTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveLatestTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-[color:oklch(var(--accent)/0.45)] text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.75)] hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="px-2 pt-3 text-sm text-muted-foreground">
          {latestTabs.find((tab) => tab.id === activeLatestTab)?.description}
        </p>
        <div className="pt-5">
          {activeLatestTab === "dossier" && (
            <TopicDossierPanel
              topics={dossierTopics}
              selectedTopicName={selectedDossierTopicName}
              onSelectTopic={setSelectedDossierTopicName}
            />
          )}

          {activeLatestTab === "newest" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card className="paper-panel rounded-[1.8rem] shadow-none">
                <CardHeader className="pb-4">
                  <p className="section-kicker">{t("latest.newest.kicker")}</p>
                  <CardTitle className="font-display text-[2rem] text-foreground">{t("latest.newest.title")}</CardTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("latest.newest.body")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {whatsNewLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="space-y-2 rounded-lg border border-border px-3 py-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ))
                  ) : whatsNew && whatsNew.latestPapers.length > 0 ? (
                    whatsNew.latestPapers.map((paper) => (
                      <div key={paper.paperId} className="rounded-[1.2rem] border border-[color:color-mix(in_oklch,oklch(var(--foreground))_7%,transparent)] bg-[color:oklch(var(--accent)/0.34)] px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={`/paper/${paper.paperId}`}
                              className="font-display text-[1.2rem] text-foreground transition-colors hover:text-primary"
                            >
                              {paper.title || paper.paperId}
                            </Link>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                              {paper.year != null && (
                                <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                                  {paper.year}
                                </span>
                              )}
                              {paper.fields.slice(0, 3).map((field) => (
                                <Link
                                  key={field}
                                  href={buildResearchHref({ query: field })}
                                  className="rounded-full bg-background/80 px-2 py-0.5 text-foreground transition-colors hover:bg-background"
                                >
                                  {field}
                                </Link>
                              ))}
                              {paper.hasCard && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                                  {t("latest.newest.deepRead")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/paper/${paper.paperId}`}
                            className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                          >
                            {t("latest.actions.detail")}
                          </Link>
                          <Link
                            href={buildExplorerPaperHref({
                              query: paper.title ?? paper.paperId,
                            })}
                            className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                          >
                            {t("latest.actions.relatedPapers")}
                          </Link>
                          <Link
                            href={buildEntityGraphHref({
                              query: paper.paperId,
                              source: "latest",
                              returnTo: LATEST_RETURN_TO,
                              label: paper.title || paper.paperId,
                            })}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                          >
                            {t("latest.actions.openGraph")}
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("latest.newest.empty")}</p>
                  )}
                </CardContent>
              </Card>

              <TrendingTopics data={trendingTopics} loading={trendingLoading} />
            </div>
          )}

          {activeLatestTab === "years" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
              <LatestPaperBuckets
                papers={recentPapers}
                loading={recentPapersLoading}
              />
              <YearChart data={recentMomentum} loading={yearLoading} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LatestResearchPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <LatestResearchContent />
    </Suspense>
  );
}
