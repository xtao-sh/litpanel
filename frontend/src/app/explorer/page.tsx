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
import { ArrowRight, FolderOpen, Microscope, SlidersHorizontal } from "lucide-react";
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
    ? "Back to Project"
    : returnToResearch
      ? "Return"
      : "Open Research";
  const ReturnIcon = isProjectReturn ? FolderOpen : Microscope;
  const explorerReturnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const getCompareHref = useCallback(
    (paperIds: string[]) =>
      buildCompareHref({
        paperIds,
        source: "explorer",
        returnTo: explorerReturnTo,
        context: currentSearchQuery || "Explorer selection",
      }),
    [currentSearchQuery, explorerReturnTo]
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
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {anyError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Some data failed to load. Please refresh the page.</p>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Explorer
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse and filter papers, atoms, and research ideas.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          onClick={() => setMobileFiltersOpen(true)}
        >
          <SlidersHorizontal className="mr-1.5 h-4 w-4" />
          Filters
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-background/80 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Explorer is the structured browsing layer
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stay here for filters, atoms, and row-level inspection. Go back to Research for topic framing, or move stable paper sets into Projects as Research Drafts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={researchHref}>
                <ReturnIcon className="mr-1.5 h-3.5 w-3.5" />
                {returnLabel}
              </Link>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-11 gap-1 p-1">
          <TabsTrigger value="papers" className="px-5 text-sm">Papers</TabsTrigger>
          <TabsTrigger value="atoms" className="px-5 text-sm">Atoms</TabsTrigger>
          <TabsTrigger value="ideas" className="px-5 text-sm">Ideas</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Results count */}
      {activeTab === "papers" && !papersLoading && (
        <p className="text-xs text-muted-foreground">
          Showing {papers.length} of {papersTotal} papers
        </p>
      )}
      {activeTab === "atoms" && !atomsLoading && (
        <p className="text-xs text-muted-foreground">
          Showing {atoms.length} of {atomsTotal} atoms
        </p>
      )}
      {activeTab === "ideas" && !ideasLoading && (
        <p className="text-xs text-muted-foreground">
          Showing {ideas.length} idea{ideas.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Main layout: sidebar + table + detail */}
      <div className="flex gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
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
        <div className="min-w-0 flex-1">
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
        </div>

        {/* Detail panel */}
        <DetailPanel
          item={detailItem}
          onClose={() => setDetailItem(null)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense boundary for useSearchParams
// ---------------------------------------------------------------------------

export default function ExplorerPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Explorer
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse and filter papers, atoms, and research ideas.
            </p>
          </div>
          <div className="h-96 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
        </div>
      }
    >
      <ExplorerContent />
    </Suspense>
  );
}
