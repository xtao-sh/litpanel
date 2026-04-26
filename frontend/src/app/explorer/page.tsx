"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  FilterPanel,
  defaultPaperFilters,
  defaultAtomFilters,
  defaultIdeaFilters,
  type PaperFilters,
  type AtomFilters,
  type IdeaFilters,
} from "@/components/explorer/filter-panel";
import { PaperTable } from "@/components/explorer/paper-table";
import { AtomTable } from "@/components/explorer/atom-table";
import { IdeaTable } from "@/components/explorer/idea-table";
import { DetailPanel } from "@/components/explorer/detail-panel";
import { GET_PAPERS, GET_ATOMS, GET_IDEAS } from "@/lib/queries";
import { buildCompareHref } from "@/lib/navigation";
import { ArrowRight, FolderOpen, Microscope, SlidersHorizontal, SearchX } from "lucide-react";
import { ExportMenu } from "@/components/shared/export-menu";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import { useI18n } from "@/lib/i18n/locale-context";
import type { Paper, Atom, Idea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Query result types
// ---------------------------------------------------------------------------

interface PapersQueryResult {
  papers: { items: Paper[]; total: number };
}

interface AtomsQueryResult {
  atoms: { items: Atom[]; total: number };
}

interface IdeasQueryResult {
  ideas: Idea[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// URL search param helpers
// ---------------------------------------------------------------------------

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function toParam(arr: string[]): string | null {
  return arr.length > 0 ? arr.join(",") : null;
}

function numParam(n: number | null): string | null {
  return n != null ? String(n) : null;
}

// ---------------------------------------------------------------------------
// Inner component that uses useSearchParams
// ---------------------------------------------------------------------------

function ExplorerContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // --- Parse URL state ---
  const activeTab = searchParams.get("tab") || "papers";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const currentSearchQuery = (searchParams.get("q") || "").trim();
  const returnToResearch = searchParams.get("returnTo");
  const researchHref = returnToResearch
    || (currentSearchQuery ? `/research?q=${encodeURIComponent(currentSearchQuery)}` : "/research");
  const isProjectReturn = returnToResearch?.startsWith("/projects/") ?? false;
  const returnLabel = isProjectReturn
    ? t("explorer.actions.backToProject")
    : returnToResearch
      ? t("explorer.actions.return")
      : t("explorer.actions.openResearch");
  const ReturnIcon = isProjectReturn ? FolderOpen : Microscope;
  const explorerReturnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const getCompareHref = useCallback(
    (paperIds: string[]) =>
      buildCompareHref({
        paperIds,
        source: "explorer",
        returnTo: explorerReturnTo,
        context: currentSearchQuery || t("explorer.hero.title"),
      }),
    [currentSearchQuery, explorerReturnTo, t]
  );

  const paperFiltersFromUrl: PaperFilters = useMemo(
    () => {
      // Parse score dimensions from URL: "dim1:3,dim2:4"
      const sdRaw = searchParams.get("scoreDim");
      const scoreDimensions = sdRaw
        ? sdRaw.split(",").filter(Boolean).map((entry) => {
            const [dimension, score] = entry.split(":");
            return { dimension, minScore: Number(score) || 3 };
          })
        : [];

      // Parse atomSlugs from URL — supports repeated atomSlug params or comma-separated
      const atomSlugParam = searchParams.get("atomSlug");
      const atomSlugs = atomSlugParam
        ? atomSlugParam.split(",").filter(Boolean)
        : searchParams.getAll("atomSlug").filter(Boolean);

      return {
        search: searchParams.get("q") || "",
        fields: parseStringArray(searchParams.get("field")),
        yearMin: parseNumber(searchParams.get("yearMin")),
        yearMax: parseNumber(searchParams.get("yearMax")),
        scoreMin: parseNumber(searchParams.get("scoreMin")),
        scoreMax: parseNumber(searchParams.get("scoreMax")),
        triageDecision: parseStringArray(searchParams.get("triage")),
        hasCard: searchParams.get("hasCard") === "1" ? true : null,
        authors: parseStringArray(searchParams.get("author")),
        methods: parseStringArray(searchParams.get("method")),
        scoreDimensions,
        atomSlugs,
      };
    },
    [searchParams]
  );

  const atomFiltersFromUrl: AtomFilters = useMemo(
    () => ({
      search: searchParams.get("q") || "",
      types: parseStringArray(searchParams.get("type")),
      evidenceStrength: parseStringArray(searchParams.get("evidence")),
      access: parseStringArray(searchParams.get("access")),
      theme: searchParams.get("theme") || "",
    }),
    [searchParams]
  );

  const ideaFiltersFromUrl: IdeaFilters = useMemo(
    () => ({
      search: searchParams.get("q") || "",
      statuses: parseStringArray(searchParams.get("status")),
    }),
    [searchParams]
  );

  // --- Local state (for debounced search) ---
  const [paperFilters, setPaperFilters] = useState(paperFiltersFromUrl);
  const [atomFilters, setAtomFilters] = useState(atomFiltersFromUrl);
  const [ideaFilters, setIdeaFilters] = useState(ideaFiltersFromUrl);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  // Detail panel
  const [detailItem, setDetailItem] = useState<
    | { type: "paper"; id: string }
    | { type: "atom"; slug: string }
    | { type: "idea"; data: Idea }
    | null
  >(null);

  // --- Sync URL -> local state when URL changes externally ---
  useEffect(() => {
    setPaperFilters(paperFiltersFromUrl);
  }, [paperFiltersFromUrl]);

  useEffect(() => {
    setAtomFilters(atomFiltersFromUrl);
  }, [atomFiltersFromUrl]);

  useEffect(() => {
    setIdeaFilters(ideaFiltersFromUrl);
  }, [ideaFiltersFromUrl]);

  // --- Debounced URL update ---
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateUrl = useCallback(
    (params: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value == null || value === "") {
          sp.delete(key);
        } else {
          sp.set(key, value);
        }
      }
      // Reset page when filters change (unless we are setting page itself)
      if (!("page" in params)) {
        sp.delete("page");
      }
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const debouncedUpdateUrl = useCallback(
    (params: Record<string, string | null>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => updateUrl(params), DEBOUNCE_MS);
    },
    [updateUrl]
  );

  // --- Tab change ---
  const handleTabChange = useCallback(
    (tab: string) => {
      setDetailItem(null);
      setCompareIds(new Set());
      updateUrl({ tab, page: null, q: null });
    },
    [updateUrl]
  );

  // --- Page change ---
  const handlePageChange = useCallback(
    (newPage: number) => {
      updateUrl({ page: newPage > 1 ? String(newPage) : null });
    },
    [updateUrl]
  );

  // --- Paper filters change ---
  const handlePaperFiltersChange = useCallback(
    (f: PaperFilters) => {
      setPaperFilters(f);
      setCompareIds(new Set());
      const params: Record<string, string | null> = {
        q: f.search || null,
        field: toParam(f.fields),
        yearMin: numParam(f.yearMin),
        yearMax: numParam(f.yearMax),
        scoreMin: f.scoreMin != null ? f.scoreMin.toFixed(1) : null,
        scoreMax: f.scoreMax != null ? f.scoreMax.toFixed(1) : null,
        triage: toParam(f.triageDecision),
        hasCard: f.hasCard ? "1" : null,
        author: toParam(f.authors),
        method: toParam(f.methods),
        scoreDim: f.scoreDimensions.length > 0
          ? f.scoreDimensions.map((d) => `${d.dimension}:${d.minScore}`).join(",")
          : null,
        atomSlug: toParam(f.atomSlugs),
      };
      // Debounce if only search changed
      if (f.search !== paperFilters.search) {
        debouncedUpdateUrl(params);
      } else {
        updateUrl(params);
      }
    },
    [paperFilters.search, updateUrl, debouncedUpdateUrl]
  );

  // --- Atom filters change ---
  const handleAtomFiltersChange = useCallback(
    (f: AtomFilters) => {
      setAtomFilters(f);
      setCompareIds(new Set());
      const params: Record<string, string | null> = {
        q: f.search || null,
        type: toParam(f.types),
        evidence: toParam(f.evidenceStrength),
        access: toParam(f.access),
        theme: f.theme || null,
      };
      if (f.search !== atomFilters.search) {
        debouncedUpdateUrl(params);
      } else {
        updateUrl(params);
      }
    },
    [atomFilters.search, updateUrl, debouncedUpdateUrl]
  );

  // --- Idea filters change ---
  const handleIdeaFiltersChange = useCallback(
    (f: IdeaFilters) => {
      setIdeaFilters(f);
      setCompareIds(new Set());
      const params: Record<string, string | null> = {
        q: f.search || null,
        status: toParam(f.statuses),
      };
      if (f.search !== ideaFilters.search) {
        debouncedUpdateUrl(params);
      } else {
        updateUrl(params);
      }
    },
    [ideaFilters.search, updateUrl, debouncedUpdateUrl]
  );

  // --- Clear all filters ---
  const handleClearFilters = useCallback(() => {
    setCompareIds(new Set());
    if (activeTab === "papers") {
      setPaperFilters(defaultPaperFilters);
    } else if (activeTab === "atoms") {
      setAtomFilters(defaultAtomFilters);
    } else {
      setIdeaFilters(defaultIdeaFilters);
    }
    // Clear all filter params from URL but keep tab
    const sp = new URLSearchParams();
    sp.set("tab", activeTab);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [activeTab, router, pathname]);

  // ---------------------------------------------------------------------------
  // GraphQL Queries
  // ---------------------------------------------------------------------------

  // Paper query variables
  const paperVars = useMemo(() => {
    const filter: Record<string, unknown> = {};
    const pf = paperFiltersFromUrl;

    if (pf.search.trim()) filter.search = pf.search.trim();
    if (pf.fields.length > 0) filter.fields = pf.fields;
    if (pf.yearMin != null) filter.yearMin = pf.yearMin;
    if (pf.yearMax != null) filter.yearMax = pf.yearMax;
    if (pf.scoreMin != null) filter.scoreMin = pf.scoreMin;
    if (pf.scoreMax != null) filter.scoreMax = pf.scoreMax;
    if (pf.triageDecision.length > 0) filter.triageDecision = pf.triageDecision;
    if (pf.hasCard != null) filter.hasCard = pf.hasCard;
    if (pf.authors.length > 0) filter.authors = pf.authors;
    if (pf.methods.length > 0) filter.methods = pf.methods;
    if (pf.scoreDimensions.length > 0)
      filter.scoreDimensions = pf.scoreDimensions.map((d) => ({
        dimension: d.dimension,
        minScore: d.minScore,
      }));
    if (pf.atomSlugs.length > 0) filter.atomSlugs = pf.atomSlugs;

    return {
      filter: Object.keys(filter).length > 0 ? filter : null,
      sort: "YEAR_DESC",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [paperFiltersFromUrl, page]);

  const {
    data: papersData,
    loading: papersLoading,
    error: papersError,
  } = useQuery<PapersQueryResult>(GET_PAPERS, {
    variables: paperVars,
    skip: activeTab !== "papers",
  });

  // Atom query variables
  const atomVars = useMemo(() => {
    const filter: Record<string, unknown> = {};
    const af = atomFiltersFromUrl;

    if (af.search.trim()) filter.search = af.search.trim();
    if (af.types.length === 1) filter.type = af.types[0];
    if (af.evidenceStrength.length === 1)
      filter.evidenceStrength = af.evidenceStrength[0];
    if (af.access.length === 1) filter.access = af.access[0];
    if (af.theme) filter.theme = af.theme;

    return {
      filter: Object.keys(filter).length > 0 ? filter : null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [atomFiltersFromUrl, page]);

  const {
    data: atomsData,
    loading: atomsLoading,
    error: atomsError,
  } = useQuery<AtomsQueryResult>(GET_ATOMS, {
    variables: atomVars,
    skip: activeTab !== "atoms",
  });

  // Ideas query
  const ideaStatusParam = useMemo(() => {
    const statuses = ideaFiltersFromUrl.statuses;
    return statuses.length === 1 ? statuses[0] : null;
  }, [ideaFiltersFromUrl]);

  const {
    data: ideasData,
    loading: ideasLoading,
    error: ideasError,
  } = useQuery<IdeasQueryResult>(GET_IDEAS, {
    variables: { status: ideaStatusParam },
    skip: activeTab !== "ideas",
  });

  const anyError = papersError || atomsError || ideasError;

  // ---------------------------------------------------------------------------
  // Server-side search: papers & atoms are filtered by the backend query.
  // Ideas still use client-side filtering for multi-status + text.
  // ---------------------------------------------------------------------------

  const papers: Paper[] = papersData?.papers?.items ?? [];
  const papersTotal: number = papersData?.papers?.total ?? 0;

  const atoms: Atom[] = atomsData?.atoms?.items ?? [];
  const atomsTotal: number = atomsData?.atoms?.total ?? 0;

  const ideas: Idea[] = useMemo(() => {
    const items = ideasData?.ideas ?? [];
    const sf = ideaFiltersFromUrl;
    let filtered = items;

    // Client-side multi-status filter
    if (sf.statuses.length > 1) {
      filtered = filtered.filter((i) => i.status && sf.statuses.includes(i.status));
    }

    const q = sf.search.toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [ideasData, ideaFiltersFromUrl]);

  // ---------------------------------------------------------------------------
  // Row click handlers
  // ---------------------------------------------------------------------------

  const handlePaperRowClick = useCallback((paper: Paper) => {
    setDetailItem((prev) =>
      prev?.type === "paper" && (prev as { id: string }).id === paper.paperId
        ? null
        : { type: "paper", id: paper.paperId }
    );
  }, []);

  const handleAtomRowClick = useCallback((atom: Atom) => {
    setDetailItem((prev) =>
      prev?.type === "atom" && (prev as { slug: string }).slug === atom.slug
        ? null
        : { type: "atom", slug: atom.slug }
    );
  }, []);

  const handleIdeaRowClick = useCallback((idea: Idea) => {
    setDetailItem((prev) =>
      prev?.type === "idea" && (prev as { data: Idea }).data.id === idea.id
        ? null
        : { type: "idea", data: idea }
    );
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

  // ---------------------------------------------------------------------------
  // Active filter count (for badge on Filters button)
  // ---------------------------------------------------------------------------

  const activeFilterCount = useMemo(() => {
    if (activeTab === "papers") {
      let count = 0;
      if (paperFilters.fields.length > 0) count++;
      if (paperFilters.triageDecision.length > 0) count++;
      if (paperFilters.yearMin !== null || paperFilters.yearMax !== null) count++;
      if (paperFilters.scoreMin !== null || paperFilters.scoreMax !== null) count++;
      if (paperFilters.hasCard !== null) count++;
      if (paperFilters.search.length > 0) count++;
      if (paperFilters.authors.length > 0) count++;
      if (paperFilters.methods.length > 0) count++;
      if (paperFilters.scoreDimensions.length > 0) count++;
      if (paperFilters.atomSlugs.length > 0) count++;
      return count;
    }
    if (activeTab === "atoms") {
      let count = 0;
      if (atomFilters.types.length > 0) count++;
      if (atomFilters.evidenceStrength.length > 0) count++;
      if (atomFilters.access.length > 0) count++;
      if (atomFilters.search.length > 0) count++;
      if (atomFilters.theme.length > 0) count++;
      return count;
    }
    let count = 0;
    if (ideaFilters.statuses.length > 0) count++;
    if (ideaFilters.search.length > 0) count++;
    return count;
  }, [activeTab, paperFilters, atomFilters, ideaFilters]);

  // Whether the current data set is empty (for empty-state rendering)
  const isCurrentTabEmpty =
    (activeTab === "papers" && !papersLoading && papers.length === 0) ||
    (activeTab === "atoms" && !atomsLoading && atoms.length === 0) ||
    (activeTab === "ideas" && !ideasLoading && ideas.length === 0);
  const combinedErrorMessage = collectErrorMessages([papersError, atomsError, ideasError]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Error banner */}
      {anyError && (
        <div className="paper-panel border-red-200/80 bg-red-50/80 p-4 text-sm text-red-700 shadow-none">
          <p className="font-medium">{t("explorer.errorTitle")}</p>
          {combinedErrorMessage ? (
            <p className="mt-1 text-xs text-red-600">{combinedErrorMessage}</p>
          ) : null}
        </div>
      )}

      {/* Page header */}
      <div className="paper-panel overflow-hidden p-0">
        <div className="grid gap-6 border-b border-border/70 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-3">
            <p className="section-kicker">{t("explorer.hero.kicker")}</p>
            <div className="space-y-2">
              <h2 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
                {t("explorer.hero.title")}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {t("explorer.hero.body")}
              </p>
            </div>
          </div>
          <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
            <p className="section-kicker">{t("explorer.hero.roleKicker")}</p>
            <p className="text-sm leading-6 text-foreground/80">
              {t("explorer.hero.roleTitle")}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("explorer.hero.roleBody")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href={researchHref}>
                <ReturnIcon className="mr-1.5 h-3.5 w-3.5" />
                {returnLabel}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/projects">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                {t("explorer.actions.openProjects")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="relative rounded-full lg:hidden"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            {t("explorer.actions.filters")}
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="paper-panel px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="section-kicker">{t("explorer.workflow.kicker")}</p>
            <p className="mt-2 text-base font-medium text-foreground">
              {t("explorer.workflow.title")}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("explorer.workflow.body")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href={researchHref}>
                <ReturnIcon className="mr-1.5 h-3.5 w-3.5" />
                {returnLabel}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/projects">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                {t("explorer.actions.openProjects")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto gap-1 rounded-full border border-border/70 bg-background/85 p-1 shadow-sm">
          <TabsTrigger value="papers" className="rounded-full px-5 py-2 text-sm">
            {t("explorer.tabs.papers")}
          </TabsTrigger>
          <TabsTrigger value="atoms" className="rounded-full px-5 py-2 text-sm">
            {t("explorer.tabs.atoms")}
          </TabsTrigger>
          <TabsTrigger value="ideas" className="rounded-full px-5 py-2 text-sm">
            {t("explorer.tabs.ideas")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Results count */}
      {activeTab === "papers" && !papersLoading && (
        <div className="paper-panel flex items-center justify-between px-4 py-3 shadow-none">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("explorer.counts.showingPapers", { shown: papers.length, total: papersTotal })}
          </p>
          <ExportMenu
            paperIds={papers.map((p) => p.paperId)}
            label={t("explorer.actions.export")}
            compact
          />
        </div>
      )}
      {activeTab === "atoms" && !atomsLoading && (
        <div className="paper-panel px-4 py-3 shadow-none">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("explorer.counts.showingAtoms", { shown: atoms.length, total: atomsTotal })}
          </p>
        </div>
      )}
      {activeTab === "ideas" && !ideasLoading && (
        <div className="paper-panel px-4 py-3 shadow-none">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t("explorer.counts.showingIdeas", { count: ideas.length })}
          </p>
        </div>
      )}

      {/* Main layout: sidebar + table + detail */}
      <div className="overflow-hidden rounded-[1.75rem] border border-border/75 bg-background/92 shadow-[0_24px_60px_rgba(44,51,71,0.08)] backdrop-blur-sm">
        <div className="flex gap-0">
        {/* Filter sidebar */}
        <FilterPanel
          activeTab={activeTab}
          paperFilters={paperFilters}
          atomFilters={atomFilters}
          ideaFilters={ideaFilters}
          onPaperFiltersChange={handlePaperFiltersChange}
          onAtomFiltersChange={handleAtomFiltersChange}
          onIdeaFiltersChange={handleIdeaFiltersChange}
          onClearFilters={handleClearFilters}
          mobileOpen={mobileFiltersOpen}
          onMobileClose={() => setMobileFiltersOpen(false)}
        />

        {/* Table area */}
        <div className="min-w-0 flex-1 [&_tbody_tr]:h-[52px] [&_tbody_tr:nth-child(even)]:bg-muted/30">
          {activeTab === "papers" && (
            <PaperTable
              data={papers}
              loading={papersLoading}
              total={papersTotal}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={handlePageChange}
              onRowClick={handlePaperRowClick}
              selectedId={
                detailItem?.type === "paper"
                  ? (detailItem as { id: string }).id
                  : null
              }
              getCompareHref={getCompareHref}
              compareIds={compareIds}
              onToggleCompare={handleToggleCompare}
              onClearCompare={handleClearCompare}
            />
          )}
          {activeTab === "atoms" && (
            <AtomTable
              data={atoms}
              loading={atomsLoading}
              total={atomsTotal}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={handlePageChange}
              onRowClick={handleAtomRowClick}
              selectedSlug={
                detailItem?.type === "atom"
                  ? (detailItem as { slug: string }).slug
                  : null
              }
            />
          )}
          {activeTab === "ideas" && (
            <IdeaTable
              data={ideas}
              loading={ideasLoading}
              onRowClick={handleIdeaRowClick}
              selectedId={
                detailItem?.type === "idea"
                  ? (detailItem as { data: Idea }).data.id
                  : null
              }
            />
          )}

          {/* Empty state when no results after filtering */}
          {isCurrentTabEmpty && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t("explorer.empty.title")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {t("explorer.empty.body")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 rounded-full"
                onClick={handleClearFilters}
              >
                {t("explorer.actions.clearFilters")}
              </Button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <DetailPanel
          item={detailItem}
          onClose={() => setDetailItem(null)}
        />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense boundary for useSearchParams
// ---------------------------------------------------------------------------

export default function ExplorerPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="paper-panel space-y-3 px-6 py-6">
            <p className="section-kicker">{t("explorer.hero.kicker")}</p>
            <h2 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              {t("explorer.hero.title")}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              {t("explorer.loading.fallbackBody")}
            </p>
          </div>
          <div className="paper-panel h-96 animate-pulse bg-muted/40" />
        </div>
      }
    >
      <ExplorerContent />
    </Suspense>
  );
}
