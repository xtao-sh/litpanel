"use client";

import React, { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { PenSquare, ChevronDown, ChevronRight, Search, X } from "lucide-react";

import { GET_IDEAS } from "@/lib/queries";
import type { Idea } from "@/lib/types";

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdeasQueryResult {
  ideas: Idea[];
}

type SortField = "composite" | "novelty" | "feasibility" | "date";
type GroupField = "none" | "heuristic" | "score" | "status";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "composite", label: "Composite" },
  { value: "novelty", label: "Novelty" },
  { value: "feasibility", label: "Feasibility" },
  { value: "date", label: "Date" },
];

const GROUP_OPTIONS: { value: GroupField; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "heuristic", label: "Heuristic" },
  { value: "score", label: "Score range" },
  { value: "status", label: "Status" },
];

const STATUS_TABS = ["all", "new", "exploring", "developing", "promoted", "killed"] as const;
const EMPTY_IDEAS: Idea[] = [];

// ---------------------------------------------------------------------------
// Score range helper
// ---------------------------------------------------------------------------

function scoreRangeLabel(composite: number | null): string {
  if (composite === null) return "Unscored";
  if (composite >= 4) return "4-5 (Excellent)";
  if (composite >= 3) return "3-4 (Good)";
  if (composite >= 2) return "2-3 (Moderate)";
  return "1-2 (Low)";
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
        <Card key={i} className="paper-panel">
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
          <div className="flex items-center gap-4 border-t border-border/70 p-6 pt-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
            <Skeleton className="h-14 w-14 rounded-lg" />
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
    <div className="paper-panel overflow-hidden p-0 shadow-none">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/45"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-display text-xl tracking-tight text-foreground">{label}</span>
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
  const initialSourceFilter = searchParams.get("source");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("composite");
  const [groupField, setGroupField] = useState<GroupField>("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [minScore, setMinScore] = useState<string>("any");
  const [heuristicFilter, setHeuristicFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(initialSourceFilter);

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
          key = idea.heuristic ?? "Unknown";
          break;
        case "score":
          key = scoreRangeLabel(idea.composite);
          break;
        case "status":
          key = idea.status ?? "Unknown";
          break;
        default:
          key = "Other";
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
  }, [processedIdeas, groupField]);

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
      <div className="paper-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <p className="section-kicker">Idea Ledger</p>
          <div>
            <h2 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              Research Ideas
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              Review generated ideas, sort by novelty or feasibility, and move
              promising candidates into your working workspace.
            </p>
          </div>
        </div>
        <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
          <p className="section-kicker">Next Step</p>
          <p className="text-sm leading-6 text-foreground/80">
            Use this page to triage candidates. Use Workspace when an idea is
            strong enough to turn into a research plan.
          </p>
          <Link href="/ideas/workspace">
            <Button variant="outline" size="sm" className="mt-1 rounded-full">
              <PenSquare className="mr-1.5 h-4 w-4" /> My Research Ideas
            </Button>
          </Link>
        </div>
      </div>

      {/* Status tabs + sort + group */}
      <div className="paper-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v)}
        >
          <TabsList className="h-11 gap-1 p-1">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="px-4 text-sm capitalize">
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Group by */}
          <Select value={groupField} onValueChange={(v) => setGroupField(v as GroupField)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <div className="rounded-full border border-border/70 bg-background/85 px-1 py-0.5 shadow-sm">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortField(opt.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortField === opt.value
                    ? "bg-accent/70 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div className="paper-panel flex flex-wrap items-center gap-2 px-5 py-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Score filter */}
        <Select value={minScore} onValueChange={setMinScore}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Min score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any" className="text-xs">Any score</SelectItem>
            <SelectItem value="4" className="text-xs">4+ (Excellent)</SelectItem>
            <SelectItem value="3" className="text-xs">3+ (Good)</SelectItem>
            <SelectItem value="2" className="text-xs">2+ (Moderate)</SelectItem>
          </SelectContent>
        </Select>

        {/* Heuristic filter */}
        {heuristics.length > 0 && (
          <Select value={heuristicFilter} onValueChange={setHeuristicFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Heuristic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All heuristics</SelectItem>
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
            Source: {sourceFilter}
            <button onClick={() => setSourceFilter(null)} className="ml-1 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-full px-2 text-xs text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="paper-panel border-red-200/80 bg-red-50/80 p-4 shadow-none">
          <p className="text-sm text-red-700">
            Failed to load ideas. Please try again later.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && <IdeasSkeleton />}

      {/* Empty state */}
      {!loading && processedIdeas.length === 0 && !error && (
        <div className="paper-panel flex flex-col items-center justify-center py-16 text-center">
          <p className="font-display text-2xl tracking-tight text-foreground">
            {hasActiveFilters
              ? "No ideas match your filters."
              : statusFilter === "all"
                ? "No research ideas found."
                : `No ideas with status "${statusFilter}".`}
          </p>
          {hasActiveFilters && (
            <Button variant="link" size="sm" className="mt-2 text-xs" onClick={clearFilters}>
              Clear all filters
            </Button>
          )}
        </div>
      )}

      {/* Ideas list */}
      {!loading && processedIdeas.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {processedIdeas.length} idea{processedIdeas.length !== 1 ? "s" : ""}
            {hasActiveFilters && ideaItems.length > 0 ? ` (of ${ideaItems.length} total)` : ""}
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
