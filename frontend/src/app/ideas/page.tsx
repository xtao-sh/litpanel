"use client";

import React, { Suspense, useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";

import { GET_IDEAS } from "@/lib/queries";
import type { Idea } from "@/lib/types";
import { collectErrorMessages } from "@/components/shared/query-error-banner";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { IdeaCard } from "@/components/ideas/idea-card";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdeasQueryResult {
  ideas: Idea[];
}

type SortField = "composite" | "novelty" | "feasibility" | "date";
type GroupField = "none" | "heuristic" | "score" | "status";

const SORT_OPTIONS: { value: SortField; labelKey: string }[] = [
  { value: "composite", labelKey: "ideas.sort.composite" },
  { value: "novelty", labelKey: "ideas.sort.novelty" },
  { value: "feasibility", labelKey: "ideas.sort.feasibility" },
  { value: "date", labelKey: "ideas.sort.date" },
];

const GROUP_OPTIONS: { value: GroupField; labelKey: string }[] = [
  { value: "none", labelKey: "ideas.group.none" },
  { value: "heuristic", labelKey: "ideas.group.heuristic" },
  { value: "score", labelKey: "ideas.group.score" },
  { value: "status", labelKey: "ideas.group.status" },
];

const STATUS_TABS = ["all", "new", "exploring", "developing", "promoted", "killed"] as const;
const EMPTY_IDEAS: Idea[] = [];

// ---------------------------------------------------------------------------
// Score range helper
// ---------------------------------------------------------------------------

function scoreRangeLabel(composite: number | null, t: (key: string) => string): string {
  if (composite === null) return t("ideas.scoreRange.unscored");
  if (composite >= 4) return t("ideas.scoreRange.excellent");
  if (composite >= 3) return t("ideas.scoreRange.good");
  if (composite >= 2) return t("ideas.scoreRange.moderate");
  return t("ideas.scoreRange.low");
}

function scoreRangeOrder(label: string): number {
  if (label.startsWith("4")) return 0;
  if (label.startsWith("3")) return 1;
  if (label.startsWith("2")) return 2;
  if (label.startsWith("1")) return 3;
  return 4; // Unscored
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function IdeasSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="lp-card">
          <CardHeader className="space-y-2 pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-5 w-3/4" />
          </CardHeader>
          <CardContent className="pb-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </CardContent>
          <div className="flex items-center gap-4 border-t border-[var(--line-soft)] p-6 pt-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
            <Skeleton className="h-14 w-14 rounded-[var(--r)]" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group section (collapsible)
// ---------------------------------------------------------------------------

interface GroupSectionProps {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function GroupSection({ label, count, children, defaultOpen = true }: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="lp-card overflow-hidden p-0 shadow-none">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--paper-2)]"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />
        )}
        <span className="font-display text-xl tracking-tight text-[var(--ink)]">{label}</span>
        <Badge variant="secondary" className="ml-1 rounded-full text-xs">
          {count}
        </Badge>
      </button>
      {open && <div className="space-y-4 px-4 pb-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IdeasPage() {
  return (
    <Suspense>
      <IdeasPageInner />
    </Suspense>
  );
}

function IdeasPageInner() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const initialSourceFilter = searchParams.get("source");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("composite");
  const [groupField, setGroupField] = useState<GroupField>("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [minScore, setMinScore] = useState<string>("any");
  const [heuristicFilter, setHeuristicFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(initialSourceFilter);

  // Re-sync the source filter when the ?source= query param changes via
  // client-side navigation (the initial value covers first render only).
  useEffect(() => {
    setSourceFilter(searchParams.get("source"));
  }, [searchParams]);

  // Query -- pass status to API when a specific status is selected
  const queryStatus = statusFilter === "all" ? undefined : statusFilter;
  const { data, loading, error } = useQuery<IdeasQueryResult>(GET_IDEAS, {
    variables: { status: queryStatus },
  });
  const ideaItems = data?.ideas ?? EMPTY_IDEAS;

  // Extract unique heuristics for filter dropdown
  const heuristics = useMemo(() => {
    const set = new Set<string>();
    ideaItems.forEach((idea) => {
      if (idea.heuristic) set.add(idea.heuristic);
    });
    return Array.from(set).sort();
  }, [ideaItems]);

  // Filter + sort ideas
  const processedIdeas = useMemo(() => {
    let ideas = [...ideaItems];

    // Text search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      ideas = ideas.filter(
        (idea) =>
          idea.title.toLowerCase().includes(q) ||
          (idea.content && idea.content.toLowerCase().includes(q))
      );
    }

    // Minimum score filter
    if (minScore !== "any") {
      const min = parseFloat(minScore);
      ideas = ideas.filter((idea) => idea.composite !== null && idea.composite >= min);
    }

    // Heuristic filter
    if (heuristicFilter !== "all") {
      ideas = ideas.filter((idea) => idea.heuristic === heuristicFilter);
    }

    // Source paper filter (from URL param)
    if (sourceFilter) {
      ideas = ideas.filter(
        (idea) => idea.sourcePapers && idea.sourcePapers.includes(sourceFilter)
      );
    }

    // Sort
    ideas.sort((a, b) => {
      switch (sortField) {
        case "composite":
          return (b.composite ?? 0) - (a.composite ?? 0);
        case "novelty":
          return (b.novelty ?? 0) - (a.novelty ?? 0);
        case "feasibility":
          return (b.feasibility ?? 0) - (a.feasibility ?? 0);
        case "date": {
          const da = a.generatedDate ? new Date(a.generatedDate).getTime() : 0;
          const db = b.generatedDate ? new Date(b.generatedDate).getTime() : 0;
          return db - da;
        }
        default:
          return 0;
      }
    });

    return ideas;
  }, [ideaItems, sortField, searchQuery, minScore, heuristicFilter, sourceFilter]);

  // Group ideas
  const groupedIdeas = useMemo(() => {
    if (groupField === "none") return null;

    const groups = new Map<string, Idea[]>();

    for (const idea of processedIdeas) {
      let key: string;
      switch (groupField) {
        case "heuristic":
          key = idea.heuristic ?? t("ideas.unknown");
          break;
        case "score":
          key = scoreRangeLabel(idea.composite, t);
          break;
        case "status":
          key = idea.status ? t(`ideas.status.${idea.status}`) : t("ideas.unknown");
          break;
        default:
          key = t("ideas.other");
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(idea);
    }

    // Sort groups
    const entries = Array.from(groups.entries());
    if (groupField === "score") {
      entries.sort((a, b) => scoreRangeOrder(a[0]) - scoreRangeOrder(b[0]));
    } else {
      entries.sort((a, b) => b[1].length - a[1].length);
    }

    return entries;
  }, [processedIdeas, groupField, t]);

  const hasActiveFilters = searchQuery.trim() !== "" || minScore !== "any" || heuristicFilter !== "all" || sourceFilter !== null;

  function clearFilters() {
    setSearchQuery("");
    setMinScore("any");
    setHeuristicFilter("all");
    setSourceFilter(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="lp-card p-6">
        <div className="space-y-3">
          <p className="section-kicker">{t("ideas.header.kicker")}</p>
          <div>
            <h2 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
              {t("ideas.header.title")}
            </h2>
          </div>
        </div>
      </div>

      {/* Status tabs + sort + group */}
      <div className="lp-card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v)}
        >
          <TabsList className="h-11 gap-1 p-1">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="px-4 text-sm">
                {t(`ideas.statusTabs.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Group by */}
          <Select value={groupField} onValueChange={(v) => setGroupField(v as GroupField)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder={t("ideas.group.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <div className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-1 py-0.5 shadow-[var(--shadow-1)]">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortField(opt.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortField === opt.value
                    ? "bg-[var(--paper-2)] text-[var(--ink)]"
                    : "text-[var(--ink-4)] hover:text-[var(--ink)]"
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div className="lp-card flex flex-wrap items-center gap-2 px-5 py-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" />
          <Input
            placeholder={t("ideas.filters.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Score filter */}
        <Select value={minScore} onValueChange={setMinScore}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder={t("ideas.filters.minScore")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any" className="text-xs">{t("ideas.filters.anyScore")}</SelectItem>
            <SelectItem value="4" className="text-xs">{t("ideas.filters.score4")}</SelectItem>
            <SelectItem value="3" className="text-xs">{t("ideas.filters.score3")}</SelectItem>
            <SelectItem value="2" className="text-xs">{t("ideas.filters.score2")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Heuristic filter */}
        {heuristics.length > 0 && (
          <Select value={heuristicFilter} onValueChange={setHeuristicFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder={t("ideas.filters.heuristic")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">{t("ideas.filters.allHeuristics")}</SelectItem>
              {heuristics.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Source paper filter indicator */}
        {sourceFilter && (
          <Badge variant="secondary" className="gap-1 rounded-full text-xs">
            {t("ideas.filters.source", { source: sourceFilter })}
            <button onClick={() => setSourceFilter(null)} className="ml-1 hover:text-[var(--ink)]">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-full px-2 text-xs text-[var(--ink-4)]"
            onClick={clearFilters}
          >
            <X className="h-3 w-3" /> {t("ideas.filters.clear")}
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="lp-card border-[#da9a80]/80 bg-[#f4dfd5]/80 p-4 shadow-none">
          <p className="text-sm font-medium text-[#8a3318]">{t("ideas.error.title")}</p>
          <p className="mt-1 text-xs text-[#8a3318]">
            {collectErrorMessages([error]) || t("ideas.error.body")}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && <IdeasSkeleton />}

      {/* Empty state */}
      {!loading && processedIdeas.length === 0 && !error && (
        <div className="lp-card flex flex-col items-center justify-center py-16 text-center">
          <p className="font-display text-2xl tracking-tight text-[var(--ink)]">
            {hasActiveFilters
              ? t("ideas.empty.filtered")
              : statusFilter === "all"
                ? t("ideas.empty.all")
                : t("ideas.empty.status", { status: t(`ideas.statusTabs.${statusFilter}`) })}
          </p>
          {hasActiveFilters && (
            <Button variant="link" size="sm" className="mt-2 text-xs" onClick={clearFilters}>
              {t("ideas.filters.clearAll")}
            </Button>
          )}
        </div>
      )}

      {/* Ideas list */}
      {!loading && processedIdeas.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ink-4)]">
            {hasActiveFilters && ideaItems.length > 0
              ? t("ideas.counts.filtered", {
                  count: processedIdeas.length.toLocaleString(),
                  total: ideaItems.length.toLocaleString(),
                })
              : t("ideas.counts.visible", { count: processedIdeas.length.toLocaleString() })}
          </p>

          {/* Grouped or flat list */}
          {groupedIdeas ? (
            <div className="space-y-4">
              {groupedIdeas.map(([groupLabel, ideas]) => (
                <GroupSection key={groupLabel} label={groupLabel} count={ideas.length}>
                  {ideas.map((idea) => (
                    <IdeaCard key={idea.id} idea={idea} />
                  ))}
                </GroupSection>
              ))}
            </div>
          ) : (
            processedIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
