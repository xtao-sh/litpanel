"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApolloClient, useQuery } from "@apollo/client/react";
import { ArrowRight, Clock3, Compass, FolderPlus, Loader2, Microscope, Sparkles, TrendingUp } from "lucide-react";

import { TrendingTopics } from "@/components/dashboard/trending-topics";
import { YearChart } from "@/components/dashboard/year-chart";
import { SaturationCard } from "@/components/research/saturation-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildCompareHref,
  buildEntityGraphHref,
  buildExplorerPaperHref,
  buildResearchGraphHref,
  buildResearchHref,
} from "@/lib/navigation";
import { createResearchDraft } from "@/lib/projects";
import { GET_PAPERS, GET_TRENDING_TOPICS, GET_WHATS_NEW, GET_YEAR_DISTRIBUTION, RESEARCH_PAPERS } from "@/lib/queries";
import type { Paper, TrendingTopic, WhatsNew } from "@/lib/types";

interface YearDistItem {
  year: number;
  count: number;
}

const PAPER_BATCH_PAGE_SIZE = 100;
const LATEST_RETURN_TO = "/latest";

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
  onCreateDraft,
  creatingTopic,
}: {
  title: string;
  description: string;
  topics: TrendingTopic[];
  emptyMessage: string;
  onCreateDraft: (topic: TrendingTopic) => void;
  creatingTopic: string | null;
}) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.length > 0 ? (
          topics.map((topic) => (
            <div
              key={`${topic.category}-${topic.name}`}
              className="rounded-lg border border-border bg-background px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{topic.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {topic.category}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                      {formatGrowthRate(topic.growthRate)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                      {topic.recentCount} recent
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      avg {topic.historicalAvg.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={buildResearchHref({ query: topic.name })}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <Microscope className="h-3 w-3" />
                  Topic workspace
                </Link>
                <Link
                  href={buildExplorerPaperHref({ query: topic.name })}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Compass className="h-3 w-3" />
                  Related papers
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creatingTopic !== null}
                  onClick={() => onCreateDraft(topic)}
                  className="h-8"
                >
                  {creatingTopic === topic.name ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Creating draft
                    </>
                  ) : (
                    <>
                      <FolderPlus className="mr-1 h-3 w-3" />
                      Create draft
                    </>
                  )}
                </Button>
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
  onCreateYearDraft,
  creatingYear,
}: {
  papers: Paper[] | undefined;
  loading: boolean;
  onCreateYearDraft: (year: number) => void;
  creatingYear: number | null;
}) {
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
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Recent Deep-Read Papers</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Newer papers with deep-read cards, grouped by publication year so you can spot which waves are active now.
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
                  <h3 className="text-sm font-semibold text-foreground">{year}</h3>
                  <span className="text-xs text-muted-foreground">
                    {entries.length} paper{entries.length !== 1 ? "s" : ""} in this preview slice
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
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <Compass className="h-3 w-3" />
                      Open year batch
                    </Link>
                    {entries.length >= 2 && (
                      <Link
                        href={buildCompareHref({
                          paperIds: entries.slice(0, 4).map((paper) => paper.paperId),
                          source: "latest",
                          returnTo: LATEST_RETURN_TO,
                          context: `${year} recent batch`,
                        })}
                        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        Compare preview
                      </Link>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={creatingYear !== null}
                      onClick={() => onCreateYearDraft(Number(year))}
                      className="h-8"
                    >
                      {creatingYear === Number(year) ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Creating draft
                        </>
                      ) : (
                        <>
                          <FolderPlus className="mr-1 h-3 w-3" />
                          Create year draft
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {entries.slice(0, 4).map((paper) => (
                  <div
                    key={paper.paperId}
                    className="rounded-lg border border-border bg-background px-3 py-3"
                  >
                    <Link
                      href={`/paper/${paper.paperId}`}
                      className="text-sm font-medium text-foreground hover:text-blue-700 hover:underline"
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
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 transition-colors hover:bg-blue-100"
                        >
                          {field}
                        </Link>
                      ))}
                      {paper.averageScore != null && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                          score {paper.averageScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No recent deep-read papers are available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TopicDossierPanel({
  topics,
  selectedTopicName,
  onSelectTopic,
  onCreateDraft,
  creatingTopic,
}: {
  topics: TrendingTopic[];
  selectedTopicName: string;
  onSelectTopic: (topicName: string) => void;
  onCreateDraft: (topic: TrendingTopic) => void;
  creatingTopic: string | null;
}) {
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
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Topic Dossier Preview</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pick a rising or cooling topic to see how mature it is, how quickly it is moving, and which papers anchor it.
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
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {topic.name}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Momentum
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatGrowthRate(selectedTopic.growthRate)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Recent output relative to historical average.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Count
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {selectedTopic.recentCount}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Topic-labelled papers in the recent window.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Corpus Match
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {loading ? "..." : totalPapers}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Papers currently matched by the topic workspace query.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildResearchHref({ query: selectedTopic.name })}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Microscope className="h-3.5 w-3.5" />
              Open topic workspace
            </Link>
            <Link
              href={buildExplorerPaperHref({ query: selectedTopic.name })}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Compass className="h-3.5 w-3.5" />
              Related papers
            </Link>
            <Link
              href={buildResearchGraphHref({
                query: selectedTopic.name,
                returnTo: LATEST_RETURN_TO,
                label: selectedTopic.name,
                source: "latest",
              })}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              Open graph
            </Link>
            {previewPapers.length >= 2 && (
              <Link
                href={buildCompareHref({
                  paperIds: previewPapers.slice(0, 4).map((paper) => paper.paperId),
                  source: "latest",
                  returnTo: LATEST_RETURN_TO,
                  context: selectedTopic.name,
                })}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Compare preview
              </Link>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creatingTopic !== null}
              onClick={() => onCreateDraft(selectedTopic)}
              className="h-9"
            >
              {creatingTopic === selectedTopic.name ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Creating draft
                </>
              ) : (
                <>
                  <FolderPlus className="mr-1 h-3.5 w-3.5" />
                  Create draft
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Preview papers</p>
              <span className="text-xs text-muted-foreground">
                {loading ? "Loading..." : `${previewPapers.length} shown`}
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
                <div key={paper.paperId} className="rounded-lg border border-border bg-background px-3 py-3">
                  <Link
                    href={`/paper/${paper.paperId}?returnTo=${encodeURIComponent(LATEST_RETURN_TO)}`}
                    className="text-sm font-medium text-foreground hover:text-blue-700 hover:underline"
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
                      <span key={field} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No preview papers are available for this topic yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <SaturationCard searchQuery={selectedTopic.name} allPaperIds={allPaperIds} />
    </div>
  );
}

function LatestResearchContent() {
  const router = useRouter();
  const client = useApolloClient();
  const [creatingTopic, setCreatingTopic] = useState<string | null>(null);
  const [creatingYear, setCreatingYear] = useState<number | null>(null);
  const [selectedDossierTopicName, setSelectedDossierTopicName] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
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

  const handleCreateTopicDraft = useCallback(
    async (topic: TrendingTopic) => {
      if (creatingTopic || creatingYear !== null) {
        return;
      }

      setCreatingTopic(topic.name);
      setDraftError(null);

      try {
        const result = await client.query<{
          researchPapers: {
            allPaperIds: string[];
          };
        }>({
          query: RESEARCH_PAPERS,
          variables: {
            query: topic.name,
            filters: null,
            sort: "YEAR_DESC",
            limit: 1,
            offset: 0,
          },
          fetchPolicy: "network-only",
        });

        const paperIds = result.data?.researchPapers?.allPaperIds ?? [];
        if (paperIds.length === 0) {
          throw new Error("No matching papers were found for this topic.");
        }

        const slug = await createResearchDraft({
          title: topic.name,
          query: topic.name,
          paperIds,
          sort: "YEAR_DESC",
          description: `Research Draft created from the Latest Research topic discovery entry for "${topic.name}".`,
        });

        router.push(`/projects/${slug}`);
      } catch (error) {
        setDraftError(
          error instanceof Error ? error.message : "Failed to create Research Draft.",
        );
      } finally {
        setCreatingTopic(null);
      }
    },
    [client, creatingTopic, creatingYear, router],
  );

  const handleCreateYearDraft = useCallback(
    async (year: number) => {
      if (creatingTopic || creatingYear !== null) {
        return;
      }

      setCreatingYear(year);
      setDraftError(null);

      try {
        const collectedIds: string[] = [];
        let total = 0;
        let offset = 0;

        do {
          const result = await client.query<{
            papers: { items: Pick<Paper, "paperId">[]; total: number };
          }>({
            query: GET_PAPERS,
            variables: {
              filter: {
                hasCard: true,
                yearMin: year,
                yearMax: year,
              },
              sort: "YEAR_DESC",
              limit: PAPER_BATCH_PAGE_SIZE,
              offset,
            },
            fetchPolicy: "network-only",
          });

          const pageItems = result.data?.papers?.items ?? [];
          total = result.data?.papers?.total ?? pageItems.length;
          if (pageItems.length === 0) {
            break;
          }
          collectedIds.push(...pageItems.map((paper) => paper.paperId));
          offset += PAPER_BATCH_PAGE_SIZE;
        } while (collectedIds.length < total);

        if (collectedIds.length === 0) {
          throw new Error(`No deep-read papers were found for ${year}.`);
        }

        const slug = await createResearchDraft({
          title: `Latest research ${year}`,
          query: `latest research ${year}`,
          paperIds: collectedIds,
          filters: {
            yearMin: year,
            yearMax: year,
            hasCard: true,
          },
          sort: "YEAR_DESC",
          description: `Research Draft created from the Latest Research year batch for ${year}, capturing ${collectedIds.length} deep-read papers.`,
        });

        router.push(`/projects/${slug}`);
      } catch (error) {
        setDraftError(
          error instanceof Error ? error.message : "Failed to create Research Draft.",
        );
      } finally {
        setCreatingYear(null);
      }
    },
    [client, creatingTopic, creatingYear, router],
  );

  return (
    <div className="animate-in space-y-6">
      {anyError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Some data failed to load. Please refresh the page.
        </div>
      )}

      {draftError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Research Draft creation failed: {draftError}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-gradient-to-br from-blue-50 via-white to-amber-50 p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-700">
                Latest Research
              </span>
              {whatsNew && (
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  {whatsNew.totalPapers.toLocaleString()} papers indexed
                </span>
              )}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Start with what is new, then follow the topic into its evidence trail.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              This page is the recency-first entry point for MDIR. Use it to see the newest deep-read
              papers, rising topics, and recent publication momentum before you move into Research,
              Explorer, or Projects.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/research"
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                <Microscope className="h-3.5 w-3.5" />
                Open Research
              </Link>
              <Link
                href="/explorer"
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <Compass className="h-3.5 w-3.5" />
                Open Explorer
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open Projects
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How To Use This Page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p>Check the newest deep-read papers first to see what has just entered the corpus.</p>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>Use rising topics to decide which research questions are gaining momentum.</p>
              </div>
              <div className="flex items-start gap-2">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <p>Use the recent year trend to tell whether a topic is new, recurring, or already mature.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Newest batch</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">
              {whatsNewLoading ? "..." : whatsNew?.latestPapersCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Papers surfaced by the latest-ingested portion of the corpus.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rising topics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">
              {trendingLoading ? "..." : trendingTopics?.filter((topic) => topic.trend === "rising").length ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Topic labels with positive recent growth relative to their historical average.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deep-read recent set</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">
              {recentPapersLoading ? "..." : recentPapers?.length ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Recent papers with richer card coverage, useful for fast orientation.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <TopicDiscoveryCard
          title="High-Momentum Topics"
          description="These topics already have visible recent volume and are still accelerating."
          topics={topicBuckets.highMomentum}
          emptyMessage="No high-momentum topics are available yet."
          onCreateDraft={handleCreateTopicDraft}
          creatingTopic={creatingTopic}
        />
        <TopicDiscoveryCard
          title="Lower-Coverage Watchlist"
          description="These topics are rising, but still have a smaller recent footprint. They are good candidates for deeper scouting."
          topics={topicBuckets.lowerCoverage}
          emptyMessage="No lower-coverage watchlist topics are available yet."
          onCreateDraft={handleCreateTopicDraft}
          creatingTopic={creatingTopic}
        />
        <TopicDiscoveryCard
          title="Cooling Topics"
          description="These topics still matter, but recent output has slowed relative to their historical baseline."
          topics={topicBuckets.cooling}
          emptyMessage="No cooling topics are available yet."
          onCreateDraft={handleCreateTopicDraft}
          creatingTopic={creatingTopic}
        />
      </div>

      <TopicDossierPanel
        topics={dossierTopics}
        selectedTopicName={selectedDossierTopicName}
        onSelectTopic={setSelectedDossierTopicName}
        onCreateDraft={handleCreateTopicDraft}
        creatingTopic={creatingTopic}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Latest In The Knowledge Base</CardTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              These are the newest papers currently surfaced by the corpus-level latest feed.
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
                <div key={paper.paperId} className="rounded-lg border border-border bg-background px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/paper/${paper.paperId}`}
                        className="text-sm font-medium text-foreground hover:text-blue-700 hover:underline"
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
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 transition-colors hover:bg-blue-100"
                          >
                            {field}
                          </Link>
                        ))}
                        {paper.hasCard && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                            deep-read
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/paper/${paper.paperId}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Detail
                    </Link>
                    <Link
                      href={buildExplorerPaperHref({
                        query: paper.title ?? paper.paperId,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      Related papers
                    </Link>
                    <Link
                      href={buildEntityGraphHref({
                        query: paper.paperId,
                        source: "latest",
                        returnTo: LATEST_RETURN_TO,
                        label: paper.title || paper.paperId,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      Open graph
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No latest papers are available yet.</p>
            )}
          </CardContent>
        </Card>

        <TrendingTopics data={trendingTopics} loading={trendingLoading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <LatestPaperBuckets
          papers={recentPapers}
          loading={recentPapersLoading}
          onCreateYearDraft={handleCreateYearDraft}
          creatingYear={creatingYear}
        />
        <YearChart data={recentMomentum} loading={yearLoading} />
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
