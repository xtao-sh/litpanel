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
  X,
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
import { useI18n } from "@/lib/i18n/locale-context";

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
  const { t } = useI18n();

  return (
    <div className={`paper-panel flex items-center gap-1 rounded-[1.2rem] px-2 py-1.5 shrink-0 ${className}`}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-medium transition-colors ${viewMode === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"}`}
        onClick={() => onChange("list")}
      >
        <List className="h-3 w-3" />
        {t("research.viewModes.list")}
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-medium transition-colors ${viewMode === "cluster" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"}`}
        onClick={() => onChange("cluster")}
      >
        <Layers className="h-3 w-3" />
        {t("research.viewModes.cluster")}
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-medium transition-colors ${viewMode === "timeline" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"}`}
        onClick={() => onChange("timeline")}
      >
        <Clock className="h-3 w-3" />
        {t("research.viewModes.timeline")}
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
  const { t } = useI18n();
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

  // Dismissible workflow card
  const [showWorkflowCard, setShowWorkflowCard] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('research-workflow-card-dismissed') !== 'true';
  });

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
      setProjectError(err instanceof Error ? err.message : t("research.errors.createDraftFailed"));
    } finally {
      setCreatingProject(false);
    }
  }, [allPaperIds, creatingProject, filters, router, sort, submittedQuery, t]);

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
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl flex-col items-center px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="paper-panel flex h-16 w-16 items-center justify-center rounded-[1.4rem]">
            <Microscope className="h-7 w-7 text-primary" />
          </div>
          <Search className="h-8 w-8 text-primary/35" />
        </div>

        <p className="section-kicker mb-2">{t("research.empty.kicker")}</p>
        <h1 className="font-display mb-2 text-[clamp(2.8rem,5vw,4.5rem)] text-foreground">
          {t("research.empty.title")}
        </h1>
        <p className="mb-8 max-w-2xl text-center text-sm text-muted-foreground">
          {t("research.empty.subtitle")}
        </p>

        <div className="paper-panel mb-6 w-full rounded-[1.8rem] p-5 text-left">
          <p className="text-sm font-medium text-foreground">
            {t("research.empty.workflowTitle")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("research.empty.workflowBody")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/explorer?tab=papers">
                <Compass className="mr-1.5 h-3.5 w-3.5" />
                {t("research.empty.openExplorer")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                {t("research.empty.openProjects")}
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
          <div className="paper-panel relative rounded-[1.8rem] p-2">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("research.empty.searchPlaceholder")}
              className="flex h-14 w-full rounded-[1.3rem] border border-input bg-background/75 pl-12 pr-4 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoFocus
            />
          </div>
        </form>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div className="w-full mb-6">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              {t("research.empty.recentSessions")}
            </p>
            <div className="grid gap-2">
              {sessions.slice(0, 5).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="paper-panel group flex w-full items-center gap-3 rounded-[1.2rem] px-4 py-3 text-left transition-all hover:bg-[color:oklch(var(--accent)/0.45)]"
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
                      {t("common.counts.papers", { count: session.paperIds.length })}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </span>
                    {confirmDeleteId === session.id ? (
                      <div className="flex items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                        <span className="text-red-600">{t("research.empty.deletePrompt")}</span>
                        <button
                          type="button"
                          onClick={(e) => { handleDeleteSession(session.id, e); setConfirmDeleteId(null); }}
                          className="text-red-600 font-medium hover:underline"
                        >
                          {t("common.actions.yes")}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                          className="text-muted-foreground hover:underline"
                        >
                          {t("common.actions.no")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(session.id); }}
                        title={t("research.empty.deleteSession")}
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
          <p className="mb-3 text-sm font-medium text-muted-foreground">{t("research.empty.try")}</p>
          <div className="grid gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                className="paper-panel w-full rounded-[1.2rem] px-4 py-3 text-left text-sm text-foreground transition-all hover:bg-[color:oklch(var(--accent)/0.45)]"
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
    <div className="flex min-h-[calc(100vh-5rem)] flex-col bg-[radial-gradient(circle_at_top_left,rgba(126,87,65,0.06),transparent_28%),linear-gradient(180deg,rgba(248,244,236,0.55),rgba(248,244,236,0.12))]">
      {/* Error banner */}
      {(papersError || landscapeError || projectError) && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-[1rem] border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {papersError
              ? t("research.errors.searchFailed", { message: papersError.message })
              : landscapeError
                ? t("research.errors.landscapeFailed", { message: landscapeError.message })
                : t("research.errors.draftFailed", { message: projectError ?? "" })}
          </span>
        </div>
      )}

      {showWorkflowCard && (
        <div className="paper-panel relative mx-4 mt-2 rounded-[1.5rem] px-4 py-4">
          <button
            onClick={() => {
              setShowWorkflowCard(false);
              localStorage.setItem('research-workflow-card-dismissed', 'true');
            }}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("research.workflow.title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("research.workflow.body")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={explorerHref}>
                  <Compass className="mr-1.5 h-3.5 w-3.5" />
                  {t("research.workflow.inspectExplorer")}
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
                {creatingProject ? t("research.workflow.creatingDraft") : t("research.workflow.createDraft")}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/projects">
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t("research.workflow.openProjects")}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {compareCount > 0 && (
        <div className="mx-4 mt-2 rounded-[1.35rem] border border-primary/15 bg-primary/10 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t(compareCount === 1 ? "research.compare.selected" : "research.compare.selectedPlural", { count: compareCount })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("research.compare.body")}
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
                {t("research.compare.compareSelected")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearCompare}>
                {t("common.actions.clear")}
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
                  placeholder={t("research.saveSession.placeholder")}
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
                  {t("common.actions.save")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-xs"
                  onClick={() => setSaveDialogOpen(false)}
                >
                  {t("common.actions.cancel")}
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
                {t("common.actions.save")}
              </Button>
            )
          ) : undefined
        }
      />

      {/* Scope summary */}
      <div className="paper-panel mx-4 mt-2 rounded-[1.35rem] px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <p className="section-kicker">{t("research.scope.kicker")}</p>
            <p className="text-sm font-medium text-foreground">
              {t("research.scope.analyzing", { count: allPaperIds.length.toLocaleString(), query: submittedQuery })}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("research.scope.body")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-background/80 px-2.5 py-1 text-muted-foreground border border-border">
              {t("research.scope.showing", { start: visibleRangeStart, end: visibleRangeEnd, total: papersTotal.toLocaleString() })}
            </span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-background/80 px-2.5 py-1 text-muted-foreground border border-border">
                {t(activeFilterCount === 1 ? "research.scope.activeFilters" : "research.scope.activeFiltersPlural", { count: activeFilterCount })}
              </span>
            )}
            <span className="rounded-full bg-background/80 px-2.5 py-1 text-muted-foreground border border-border">
              {t("research.scope.view", { view: t(`research.viewModes.${viewMode}`) })}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="block xl:hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab}>
          <TabsList className="paper-panel mx-4 mt-2 h-10 gap-1 rounded-[1.2rem] p-1">
            <TabsTrigger value="results" className="px-4 text-xs">
              {t("research.tabs.results")}
            </TabsTrigger>
            <TabsTrigger value="landscape" className="px-4 text-xs">
              {t("research.tabs.landscape")}
            </TabsTrigger>
            <TabsTrigger value="chat" className="px-4 text-xs">
              {t("research.tabs.chat")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="min-h-[calc(100vh-14rem)] px-4 pb-4">
            {allPaperIds.length >= 4 && (
              <ViewModeToggle className="px-1" viewMode={viewMode} onChange={handleViewModeChange} />
            )}
            {renderResultsContent()}
          </TabsContent>

          <TabsContent value="landscape" className="min-h-[calc(100vh-14rem)] px-4 pb-4">
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

          <TabsContent value="chat" className="min-h-[calc(100vh-14rem)]">
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
        <div className="w-[380px] shrink-0 overflow-hidden border-r border-border/70 bg-background/35 px-3 pb-3 pt-3 flex flex-col">
          {allPaperIds.length >= 4 && (
            <ViewModeToggle className="mb-3" viewMode={viewMode} onChange={handleViewModeChange} />
          )}
          {renderResultsContent()}
        </div>

        {/* Center: Landscape */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
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
          <div className="w-[380px] shrink-0 bg-background/30 px-3 py-3">
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
