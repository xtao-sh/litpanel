"use client";

import React, { Suspense, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  ArrowRight,
  Microscope,
  Search,
  Layers,
  List,
  AlertCircle,
  Clock,
  Save,
  Trash2,
  FileText,
  Compass,
  FolderOpen,
  FolderPlus,
  Loader2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResearchQueryBar } from "@/components/research/research-query-bar";
import { ResearchResultsList } from "@/components/research/research-results-list";
import { ResearchLandscapePanel } from "@/components/research/research-landscape";
import { ResearchChat } from "@/components/research/research-chat";
import { ClusterView } from "@/components/research/cluster-view";
import { TimelineView } from "@/components/research/timeline-view";
import {
  RESEARCH_PAPERS,
  RESEARCH_LANDSCAPE,
  GET_RESEARCH_SESSIONS,
  SAVE_RESEARCH_SESSION,
  DELETE_RESEARCH_SESSION,
} from "@/lib/queries";
import {
  buildCompareHref,
  buildExplorerPaperHref,
  buildResearchGraphHref,
  buildResearchHref,
} from "@/lib/navigation";
import { createResearchDraft } from "@/lib/projects";
import type {
  ResearchPaperItem,
  ResearchLandscape,
  ResearchFilter,
  ResearchSessionItem,
} from "@/lib/types";

type ResearchViewMode = "list" | "cluster" | "timeline";

interface ViewModeToggleProps {
  viewMode: ResearchViewMode;
  onChange: (mode: ResearchViewMode) => void;
  className?: string;
}

function ViewModeToggle({
  viewMode,
  onChange,
  className = "",
}: ViewModeToggleProps) {
  return (
    <div className={`flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0 ${className}`}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
        onClick={() => onChange("list")}
      >
        <List className="h-3 w-3" />
        List
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${viewMode === "cluster" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
        onClick={() => onChange("cluster")}
      >
        <Layers className="h-3 w-3" />
        Clusters
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${viewMode === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
        onClick={() => onChange("timeline")}
      >
        <Clock className="h-3 w-3" />
        Timeline
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Query result types
// ---------------------------------------------------------------------------

interface ResearchPapersResult {
  researchPapers: {
    papers: { total: number; items: ResearchPaperItem[] };
    allPaperIds: string[];
  };
}

interface ResearchLandscapeResult {
  researchLandscape: ResearchLandscape;
}

interface ResearchSessionsResult {
  researchSessions: ResearchSessionItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const EXAMPLE_QUERIES = [
  "Effect of AI on labor market outcomes",
  "Hospital mergers and quality of care",
  "Minimum wage and firm entry in developing countries",
  "Identification in difference-in-differences designs",
];

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function parseViewMode(value: string | null): ResearchViewMode {
  if (value === "cluster" || value === "timeline") {
    return value;
  }
  return "list";
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ResearchPage() {
  return (
    <Suspense>
      <ResearchPageInner />
    </Suspense>
  );
}

function ResearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = (searchParams.get("q") ?? "").trim();
  const initialFilters: ResearchFilter = {
    fields: parseStringArray(searchParams.get("field")),
    yearMin: parseNumber(searchParams.get("yearMin")),
    yearMax: parseNumber(searchParams.get("yearMax")),
    scoreMin: parseNumber(searchParams.get("scoreMin")),
    scoreMax: parseNumber(searchParams.get("scoreMax")),
    hasCard: searchParams.get("hasCard") === "1" ? true : undefined,
    atomSlugs: parseStringArray(searchParams.get("atomSlug")),
  };
  const initialSort = searchParams.get("sort") ?? "";
  const initialPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const initialViewMode = parseViewMode(searchParams.get("view"));

  // State
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ResearchFilter>(initialFilters);
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(initialPage);
  const [mobileTab, setMobileTab] = useState("results");
  const [viewMode, setViewMode] = useState<ResearchViewMode>(initialViewMode);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  // Save session dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Whether a search has been performed
  const hasSearched = submittedQuery.length > 0;
  const currentResearchHref = useMemo(
    () =>
      buildResearchHref({
        query: submittedQuery,
        filters,
        sort,
        page,
        viewMode,
      }),
    [submittedQuery, filters, sort, page, viewMode]
  );
  const explorerHref = useMemo(
    () =>
      buildExplorerPaperHref({
        query: submittedQuery,
        filters,
        returnTo: currentResearchHref,
      }),
    [submittedQuery, filters, currentResearchHref]
  );
  const compareHref = useMemo(
    () =>
      compareIds.size >= 2
        ? buildCompareHref({
            paperIds: Array.from(compareIds),
            source: "research",
            returnTo: currentResearchHref,
            context: submittedQuery,
          })
        : null,
    [compareIds, currentResearchHref, submittedQuery]
  );
  const graphHref = useMemo(
    () =>
      submittedQuery
        ? buildResearchGraphHref({
            query: submittedQuery,
            filters,
            returnTo: currentResearchHref,
            label: submittedQuery,
          })
        : null,
    [currentResearchHref, filters, submittedQuery]
  );

  // ---------------------------------------------------------------------------
  // Papers query
  // ---------------------------------------------------------------------------

  const papersVars = useMemo(() => {
    if (!submittedQuery) return null;

    const filterInput: Record<string, unknown> = {};
    if (filters.fields && filters.fields.length > 0) filterInput.fields = filters.fields;
    if (filters.yearMin != null) filterInput.yearMin = filters.yearMin;
    if (filters.yearMax != null) filterInput.yearMax = filters.yearMax;
    if (filters.scoreMin != null) filterInput.scoreMin = filters.scoreMin;
    if (filters.scoreMax != null) filterInput.scoreMax = filters.scoreMax;
    if (filters.hasCard != null) filterInput.hasCard = filters.hasCard;
    if (filters.atomSlugs && filters.atomSlugs.length > 0)
      filterInput.atomSlugs = filters.atomSlugs;

    return {
      query: submittedQuery,
      filters: Object.keys(filterInput).length > 0 ? filterInput : null,
      sort: sort || null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [submittedQuery, filters, sort, page]);

  const {
    data: papersData,
    loading: papersLoading,
    error: papersError,
  } = useQuery<ResearchPapersResult>(RESEARCH_PAPERS, {
    variables: papersVars ?? {},
    skip: !papersVars,
  });

  // Extract results
  const papers = papersData?.researchPapers?.papers?.items ?? [];
  const papersTotal = papersData?.researchPapers?.papers?.total ?? 0;
  const allPaperIds = useMemo(
    () => papersData?.researchPapers?.allPaperIds ?? [],
    [papersData?.researchPapers?.allPaperIds]
  );

  // ---------------------------------------------------------------------------
  // Landscape query
  // ---------------------------------------------------------------------------

  const {
    data: landscapeData,
    loading: landscapeLoading,
    error: landscapeError,
  } = useQuery<ResearchLandscapeResult>(RESEARCH_LANDSCAPE, {
    variables: { paperIds: allPaperIds },
    skip: allPaperIds.length === 0,
  });

  const landscape = landscapeData?.researchLandscape ?? null;

  // ---------------------------------------------------------------------------
  // Research Sessions
  // ---------------------------------------------------------------------------

  const {
    data: sessionsData,
  } = useQuery<ResearchSessionsResult>(GET_RESEARCH_SESSIONS, {
    skip: hasSearched,
  });

  const sessions = sessionsData?.researchSessions ?? [];

  const [saveSession] = useMutation(SAVE_RESEARCH_SESSION, {
    refetchQueries: [{ query: GET_RESEARCH_SESSIONS }],
  });

  const [deleteSession] = useMutation(DELETE_RESEARCH_SESSION, {
    refetchQueries: [{ query: GET_RESEARCH_SESSIONS }],
  });

  const handleSaveSession = useCallback(async () => {
    if (!sessionTitle.trim() || !submittedQuery) return;
    try {
      await saveSession({
        variables: {
          title: sessionTitle.trim(),
          query: submittedQuery,
          filters: JSON.stringify(filters),
          sort: sort,
          paperIds: allPaperIds,
          notes: "",
        },
      });
      setSaveDialogOpen(false);
      setSessionTitle("");
    } catch (err) {
      console.error("Failed to save session:", err);
    }
  }, [sessionTitle, submittedQuery, filters, sort, allPaperIds, saveSession]);

  const handleCreateProjectDraft = useCallback(async () => {
    if (!submittedQuery || allPaperIds.length === 0 || creatingProject) return;

    setCreatingProject(true);
    setProjectError(null);

    try {
      const slug = await createResearchDraft({
        title: submittedQuery,
        query: submittedQuery,
        filters,
        sort,
        paperIds: allPaperIds,
      });
      router.push(`/projects/${slug}`);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Failed to create Research Draft.");
    } finally {
      setCreatingProject(false);
    }
  }, [allPaperIds, creatingProject, filters, router, sort, submittedQuery]);

  const handleRestoreSession = useCallback((session: ResearchSessionItem) => {
    setQuery(session.query);
    setSubmittedQuery(session.query);
    setCompareIds(new Set());
    let parsedFilters: ResearchFilter = {};
    try {
      parsedFilters = JSON.parse(session.filters || "{}");
      setFilters(parsedFilters);
    } catch {
      setFilters({});
    }
    setSort(session.sort || "");
    setPage(1);
    setSelectedPaperId(null);
    setProjectError(null);
    router.replace(
      buildResearchHref({
        query: session.query,
        filters: parsedFilters,
        sort: session.sort || "",
        page: 1,
        viewMode,
      }),
      { scroll: false }
    );
  }, [router, viewMode]);

  const handleDeleteSession = useCallback(
    async (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await deleteSession({ variables: { id } });
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [deleteSession]
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    setPage(1);
    setSelectedPaperId(null);
    setCompareIds(new Set());
    setProjectError(null);
    router.replace(
      buildResearchHref({
        query: nextQuery,
        filters,
        sort,
        page: 1,
        viewMode,
      }),
      { scroll: false }
    );
  }, [filters, query, router, sort, viewMode]);

  const handleExampleClick = useCallback((example: string) => {
    setQuery(example);
    setSubmittedQuery(example);
    setPage(1);
    setSelectedPaperId(null);
    setCompareIds(new Set());
    setProjectError(null);
    router.replace(
      buildResearchHref({
        query: example,
        filters,
        sort,
        page: 1,
        viewMode,
      }),
      { scroll: false }
    );
  }, [filters, router, sort, viewMode]);

  const handleFiltersChange = useCallback(
    (f: ResearchFilter) => {
      setFilters(f);
      setPage(1);
      setCompareIds(new Set());
      setProjectError(null);
      if (submittedQuery) {
        router.replace(
          buildResearchHref({
            query: submittedQuery,
            filters: f,
            sort,
            page: 1,
            viewMode,
          }),
          { scroll: false }
        );
      }
    },
    [router, sort, submittedQuery, viewMode]
  );

  const handleSortChange = useCallback((s: string) => {
    setSort(s);
    setPage(1);
    setProjectError(null);
    if (submittedQuery) {
      router.replace(
        buildResearchHref({
          query: submittedQuery,
          filters,
          sort: s,
          page: 1,
          viewMode,
        }),
        { scroll: false }
      );
    }
  }, [filters, router, submittedQuery, viewMode]);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    setProjectError(null);
    if (submittedQuery) {
      router.replace(
        buildResearchHref({
          query: submittedQuery,
          filters,
          sort,
          page: p,
          viewMode,
        }),
        { scroll: false }
      );
    }
  }, [filters, router, sort, submittedQuery, viewMode]);

  const handleSelectPaper = useCallback((paperId: string) => {
    setSelectedPaperId((prev) => (prev === paperId ? null : paperId));
  }, []);

  const handleToggleCompare = useCallback((paperId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else if (next.size < 8) {
        next.add(paperId);
      }
      return next;
    });
  }, []);

  const handleClearCompare = useCallback(() => {
    setCompareIds(new Set());
  }, []);

  const handleAtomClick = useCallback(
    (slug: string) => {
      const currentSlugs = filters.atomSlugs ?? [];
      const nextFilters: ResearchFilter = currentSlugs.includes(slug)
        ? {
            ...filters,
            atomSlugs: currentSlugs.filter((s) => s !== slug),
          }
        : {
            ...filters,
            atomSlugs: [...currentSlugs, slug],
          };

      if (!nextFilters.atomSlugs || nextFilters.atomSlugs.length === 0) {
        delete nextFilters.atomSlugs;
      }

      setFilters(nextFilters);
      setPage(1);
      setCompareIds(new Set());
      setProjectError(null);
      if (submittedQuery) {
        router.replace(
          buildResearchHref({
            query: submittedQuery,
            filters: nextFilters,
            sort,
            page: 1,
            viewMode,
          }),
          { scroll: false }
        );
      }
    },
    [filters, router, sort, submittedQuery, viewMode]
  );

  const handleChatToggle = useCallback(() => {
    setChatOpen((prev) => !prev);
  }, []);

  const handleViewModeChange = useCallback((mode: ResearchViewMode) => {
    setViewMode(mode);
    if (submittedQuery) {
      router.replace(
        buildResearchHref({
          query: submittedQuery,
          filters,
          sort,
          page,
          viewMode: mode,
        }),
        { scroll: false }
      );
    }
  }, [filters, page, router, sort, submittedQuery]);

  const activeFilterCount = [
    (filters.fields?.length ?? 0) > 0,
    filters.yearMin != null,
    filters.yearMax != null,
    filters.scoreMin != null,
    filters.scoreMax != null,
    filters.hasCard != null,
    (filters.atomSlugs?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const visibleRangeStart = papersTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const visibleRangeEnd = papersTotal === 0 ? 0 : Math.min(page * PAGE_SIZE, papersTotal);
  const compareCount = compareIds.size;
  const canCompare = compareCount >= 2 && compareCount <= 8;

  function renderResultsContent() {
    if (viewMode === "timeline") {
      return (
        <TimelineView
          query={submittedQuery}
          limitPerYear={5}
          compareIds={compareIds}
          onToggleCompare={handleToggleCompare}
        />
      );
    }
    if (viewMode === "cluster") {
      return (
        <ClusterView
          allPaperIds={allPaperIds}
          onSelectPaper={handleSelectPaper}
          selectedPaperId={selectedPaperId}
          compareIds={compareIds}
          onToggleCompare={handleToggleCompare}
        />
      );
    }
    return (
      <ResearchResultsList
        papers={papers}
        loading={papersLoading}
        total={papersTotal}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={handlePageChange}
        selectedPaperId={selectedPaperId}
        onSelectPaper={handleSelectPaper}
        allPaperIds={allPaperIds}
        compareIds={compareIds}
        onToggleCompare={handleToggleCompare}
        onClearCompare={handleClearCompare}
        compareHref={compareHref}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state (no search submitted)
  // ---------------------------------------------------------------------------

  if (!hasSearched) {
    return (
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-2xl flex-col items-center justify-center px-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <Microscope className="h-7 w-7 text-blue-600" />
          </div>
          <Search className="h-8 w-8 text-blue-300" />
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
          Research Mode
        </h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">
          Explore a topic, map the literature, and discover what&apos;s missing.
        </p>

        <div className="mb-6 w-full rounded-2xl border border-border bg-background/80 p-4 text-left">
          <p className="text-sm font-medium text-foreground">
            Research is the first step in the workflow
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Start here when you have a topic question. Once the paper set stabilizes, inspect evidence in Explorer or capture it in Projects as a Research Draft.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/explorer?tab=papers">
                <Compass className="mr-1.5 h-3.5 w-3.5" />
                Open Explorer
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Open Projects
              </Link>
            </Button>
          </div>
        </div>

        {/* Large search input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="mb-8 w-full"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a research topic..."
              className="flex h-14 w-full rounded-2xl border border-input bg-muted/30 pl-12 pr-4 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoFocus
            />
          </div>
        </form>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div className="w-full mb-6">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Recent Sessions:
            </p>
            <div className="grid gap-2">
              {sessions.slice(0, 5).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-sm"
                  onClick={() => handleRestoreSession(session)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {session.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      &ldquo;{session.query}&rdquo;
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {session.paperIds.length} papers
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </span>
                    {confirmDeleteId === session.id ? (
                      <div className="flex items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                        <span className="text-red-600">Delete?</span>
                        <button
                          type="button"
                          onClick={(e) => { handleDeleteSession(session.id, e); setConfirmDeleteId(null); }}
                          className="text-red-600 font-medium hover:underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                          className="text-muted-foreground hover:underline"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(session.id); }}
                        title="Delete session"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400 hover:text-red-600" />
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Example queries */}
        <div className="w-full">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Try:</p>
          <div className="grid gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left text-sm text-foreground transition-all hover:border-primary/50 hover:bg-blue-50/50 hover:shadow-sm"
                onClick={() => handleExampleClick(example)}
              >
                &ldquo;{example}&rdquo;
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Search results view
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      {/* Error banner */}
      {(papersError || landscapeError || projectError) && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {papersError
              ? `Search failed: ${papersError.message}`
              : landscapeError
                ? `Landscape analysis failed: ${landscapeError.message}`
                : `Research Draft creation failed: ${projectError}`}
          </span>
        </div>
      )}

      <div className="mx-4 mt-2 rounded-xl border border-border bg-background/80 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Topic-first discovery belongs here
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use Research to define the paper set, Explorer to inspect records, and Projects when the set is stable enough for synthesis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={explorerHref}>
                <Compass className="mr-1.5 h-3.5 w-3.5" />
                Inspect in Explorer
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={handleCreateProjectDraft}
              disabled={allPaperIds.length === 0 || creatingProject}
            >
              {creatingProject ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create Research Draft
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Open Projects
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {compareCount > 0 && (
        <div className="mx-4 mt-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">
                {compareCount} paper{compareCount !== 1 ? "s" : ""} selected for comparison
              </p>
              <p className="mt-1 text-sm text-blue-800/80">
                Selection stays available while you switch between list, cluster, and timeline views.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canCompare || !compareHref}
                onClick={() => {
                  if (compareHref) {
                    router.push(compareHref);
                  }
                }}
              >
                Compare Selected
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearCompare}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Query bar with save button */}
      <ResearchQueryBar
        query={query}
        onQueryChange={setQuery}
        onSubmit={handleSubmit}
        totalPapers={papersLoading ? null : papersTotal}
        sort={sort}
        onSortChange={handleSortChange}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        extraActions={
          allPaperIds.length > 0 ? (
            saveDialogOpen ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5 shadow-lg">
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="Session name..."
                  className="h-7 w-36 rounded-md border border-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveSession();
                    if (e.key === "Escape") setSaveDialogOpen(false);
                  }}
                />
                <Button
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleSaveSession}
                  disabled={!sessionTitle.trim()}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-xs"
                  onClick={() => setSaveDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  setSessionTitle(submittedQuery);
                  setSaveDialogOpen(true);
                }}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            )
          ) : undefined
        }
      />

      {/* Scope summary */}
      <div className="border-b border-border bg-muted/20 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Analyzing <span className="font-semibold">{allPaperIds.length.toLocaleString()}</span> matched paper
              {allPaperIds.length !== 1 ? "s" : ""} for &ldquo;{submittedQuery}&rdquo;
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Landscape cards below are computed from the current matched paper set. Methods, datasets,
              and mechanisms come from linked atoms; gap summaries combine paper limitations and open
              questions with methods or datasets used in sibling-field papers but absent from this set.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-background px-2.5 py-1 text-muted-foreground border border-border">
              Showing {visibleRangeStart}-{visibleRangeEnd} of {papersTotal.toLocaleString()}
            </span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-background px-2.5 py-1 text-muted-foreground border border-border">
                {activeFilterCount} active filter{activeFilterCount !== 1 ? "s" : ""}
              </span>
            )}
            <span className="rounded-full bg-background px-2.5 py-1 text-muted-foreground border border-border">
              View: {viewMode}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="block xl:hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab}>
          <TabsList className="mx-4 mt-2 h-9 gap-1 p-1">
            <TabsTrigger value="results" className="px-4 text-xs">
              Results
            </TabsTrigger>
            <TabsTrigger value="landscape" className="px-4 text-xs">
              Landscape
            </TabsTrigger>
            <TabsTrigger value="chat" className="px-4 text-xs">
              Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="h-[calc(100vh-14rem)] overflow-hidden px-4 pb-4">
            {allPaperIds.length >= 4 && (
              <ViewModeToggle className="px-1" viewMode={viewMode} onChange={handleViewModeChange} />
            )}
            {renderResultsContent()}
          </TabsContent>

          <TabsContent value="landscape" className="h-[calc(100vh-14rem)] overflow-y-auto px-4 pb-4">
            <ResearchLandscapePanel
              landscape={landscape}
              loading={landscapeLoading && allPaperIds.length > 0}
              onAtomClick={handleAtomClick}
              allPaperIds={allPaperIds}
              searchQuery={submittedQuery}
              graphHref={graphHref ?? undefined}
              papers={papers}
            />
          </TabsContent>

          <TabsContent value="chat" className="h-[calc(100vh-14rem)]">
            <ResearchChat
              open={true}
              onToggle={handleChatToggle}
              allPaperIds={allPaperIds}
              searchQuery={submittedQuery}
              landscape={landscape}
              totalPapers={papersTotal}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop three-column layout */}
      <div className="hidden flex-1 overflow-hidden xl:flex">
        {/* Left: Results list */}
        <div className="w-[380px] shrink-0 overflow-hidden border-r border-border flex flex-col">
          {allPaperIds.length >= 4 && (
            <ViewModeToggle viewMode={viewMode} onChange={handleViewModeChange} />
          )}
          {renderResultsContent()}
        </div>

        {/* Center: Landscape */}
        <div className="flex-1 overflow-y-auto p-4">
          <ResearchLandscapePanel
            landscape={landscape}
            loading={landscapeLoading && allPaperIds.length > 0}
            onAtomClick={handleAtomClick}
            allPaperIds={allPaperIds}
            searchQuery={submittedQuery}
            graphHref={graphHref ?? undefined}
            papers={papers}
          />
        </div>

        {/* Right: Chat (collapsible) */}
        {chatOpen ? (
          <div className="w-[380px] shrink-0">
            <ResearchChat
              open={chatOpen}
              onToggle={handleChatToggle}
              allPaperIds={allPaperIds}
              searchQuery={submittedQuery}
              landscape={landscape}
              totalPapers={papersTotal}
            />
          </div>
        ) : (
          <div className="flex shrink-0 items-start p-3">
            <ResearchChat
              open={false}
              onToggle={handleChatToggle}
              allPaperIds={allPaperIds}
              searchQuery={submittedQuery}
              landscape={landscape}
              totalPapers={papersTotal}
            />
          </div>
        )}
      </div>
    </div>
  );
}
