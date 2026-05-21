import type { ResearchFilter } from "@/lib/types";

type CompareSource = "research" | "explorer" | "paper" | "latest";
type GraphSource = "research" | "paper" | "ask" | "project" | "latest";

interface BuildResearchHrefOptions {
  query: string;
  filters?: ResearchFilter;
  sort?: string;
  page?: number;
  viewMode?: "list" | "cluster" | "timeline";
}

interface BuildExplorerPaperHrefOptions {
  query: string;
  filters?: ResearchFilter;
  returnTo?: string;
}

interface BuildExplorerAtomHrefOptions {
  atomSlug: string;
  query?: string;
  returnTo?: string;
  filters?: ResearchFilter;
}

interface BuildCompareHrefOptions {
  paperIds: string[];
  source?: CompareSource;
  returnTo?: string;
  context?: string;
}

interface BuildPaperDetailHrefOptions {
  paperId: string;
  returnTo?: string;
}

interface BuildAtomDetailHrefOptions {
  atomSlug: string;
  returnTo?: string;
}

interface BuildFieldDetailHrefOptions {
  field: string;
}

interface BuildResearchGraphHrefOptions {
  query: string;
  filters?: ResearchFilter;
  returnTo?: string;
  label?: string;
  source?: GraphSource;
}

interface BuildEntityGraphHrefOptions {
  query: string;
  source?: GraphSource;
  returnTo?: string;
  label?: string;
}

interface BuildPaperGraphHrefOptions {
  paperId: string;
  source?: GraphSource;
  returnTo?: string;
  label?: string;
}

interface BuildPaperSetGraphHrefOptions {
  paperIds: string[];
  source?: GraphSource;
  returnTo?: string;
  label?: string;
}

interface BuildProjectGraphHrefOptions {
  paperIds: string[];
  projectSlug: string;
  projectTitle: string;
  tab?: "overview" | "dossier" | "chronology" | "themes" | "methods" | "gaps" | "matrix";
  label?: string;
}

function appendReturnTo(basePath: string, returnTo?: string): string {
  if (!returnTo) {
    return basePath;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("returnTo", returnTo);
  return `${basePath}?${searchParams.toString()}`;
}

function applyResearchFilters(searchParams: URLSearchParams, filters: ResearchFilter = {}) {
  if (filters.fields && filters.fields.length > 0) {
    searchParams.set("field", filters.fields.join(","));
  }
  if (filters.yearMin != null) {
    searchParams.set("yearMin", String(filters.yearMin));
  }
  if (filters.yearMax != null) {
    searchParams.set("yearMax", String(filters.yearMax));
  }
  if (filters.scoreMin != null) {
    searchParams.set("scoreMin", String(filters.scoreMin));
  }
  if (filters.scoreMax != null) {
    searchParams.set("scoreMax", String(filters.scoreMax));
  }
  if (filters.hasCard) {
    searchParams.set("hasCard", "1");
  }
  if (filters.atomSlugs && filters.atomSlugs.length > 0) {
    searchParams.set("atomSlug", filters.atomSlugs.join(","));
  }
}

export function buildResearchHref({
  query,
  filters = {},
  sort = "",
  page = 1,
  viewMode = "list",
}: BuildResearchHrefOptions): string {
  const searchParams = new URLSearchParams();
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    searchParams.set("q", trimmedQuery);
  }

  applyResearchFilters(searchParams, filters);

  if (sort) {
    searchParams.set("sort", sort);
  }
  if (page > 1) {
    searchParams.set("page", String(page));
  }
  if (viewMode !== "list") {
    searchParams.set("view", viewMode);
  }

  const qs = searchParams.toString();
  return `/research${qs ? `?${qs}` : ""}`;
}

export function buildExplorerPaperHref({
  query,
  filters = {},
  returnTo,
}: BuildExplorerPaperHrefOptions): string {
  const searchParams = new URLSearchParams();
  searchParams.set("tab", "papers");

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    searchParams.set("q", trimmedQuery);
  }

  applyResearchFilters(searchParams, filters);

  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }

  return `/explorer?${searchParams.toString()}`;
}

export function buildExplorerAtomHref({
  atomSlug,
  query = "",
  returnTo,
  filters = {},
}: BuildExplorerAtomHrefOptions): string {
  const nextFilters: ResearchFilter = {
    ...filters,
    atomSlugs: [atomSlug],
  };

  return buildExplorerPaperHref({
    query,
    filters: nextFilters,
    returnTo,
  });
}

export function buildCompareHref({
  paperIds,
  source,
  returnTo,
  context,
}: BuildCompareHrefOptions): string {
  const searchParams = new URLSearchParams();

  if (paperIds.length > 0) {
    searchParams.set("ids", paperIds.join(","));
  }
  if (source) {
    searchParams.set("source", source);
  }
  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }
  if (context) {
    searchParams.set("context", context);
  }

  return `/compare?${searchParams.toString()}`;
}

export function buildPaperDetailHref({
  paperId,
  returnTo,
}: BuildPaperDetailHrefOptions): string {
  return appendReturnTo(`/paper/${paperId}`, returnTo);
}

export function buildAtomDetailHref({
  atomSlug,
  returnTo,
}: BuildAtomDetailHrefOptions): string {
  return appendReturnTo(`/atom/${atomSlug}`, returnTo);
}

export function buildFieldDetailHref({ field }: BuildFieldDetailHrefOptions): string {
  const searchParams = new URLSearchParams();
  searchParams.set("field", field);
  return `/fields?${searchParams.toString()}`;
}

export function buildResearchGraphHref({
  query,
  filters = {},
  returnTo,
  label,
  source = "research",
}: BuildResearchGraphHrefOptions): string {
  const searchParams = new URLSearchParams();
  const trimmedQuery = query.trim();

  searchParams.set("mode", "paper-set");
  if (trimmedQuery) {
    searchParams.set("contextQuery", trimmedQuery);
  }
  if (label) {
    searchParams.set("label", label);
  }
  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }
  searchParams.set("source", source);
  applyResearchFilters(searchParams, filters);

  return `/graph?${searchParams.toString()}`;
}

export function buildEntityGraphHref({
  query,
  source,
  returnTo,
  label,
}: BuildEntityGraphHrefOptions): string {
  const searchParams = new URLSearchParams();
  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    searchParams.set("q", trimmedQuery);
  }
  if (source) {
    searchParams.set("source", source);
  }
  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }
  if (label) {
    searchParams.set("label", label);
  }
  return `/graph?${searchParams.toString()}`;
}

export function buildPaperGraphHref({
  paperId,
  source,
  returnTo,
  label,
}: BuildPaperGraphHrefOptions): string {
  const searchParams = new URLSearchParams();
  const trimmedPaperId = paperId.trim();
  searchParams.set("mode", "paper");
  if (trimmedPaperId) {
    searchParams.set("paperId", trimmedPaperId);
  }
  if (source) {
    searchParams.set("source", source);
  }
  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }
  if (label) {
    searchParams.set("label", label);
  }
  return `/graph?${searchParams.toString()}`;
}

export function buildPaperSetGraphHref({
  paperIds,
  source,
  returnTo,
  label,
}: BuildPaperSetGraphHrefOptions): string {
  const searchParams = new URLSearchParams();
  searchParams.set("mode", "paper-ids");
  if (paperIds.length > 0) {
    searchParams.set("ids", paperIds.join(","));
  }
  if (source) {
    searchParams.set("source", source);
  }
  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }
  if (label) {
    searchParams.set("label", label);
  }
  return `/graph?${searchParams.toString()}`;
}

export function buildProjectGraphHref({
  paperIds,
  projectSlug,
  projectTitle,
  tab = "overview",
  label,
}: BuildProjectGraphHrefOptions): string {
  const returnTo =
    tab === "overview" ? `/projects/${projectSlug}` : `/projects/${projectSlug}/${tab}`;

  return buildPaperSetGraphHref({
    paperIds,
    source: "project",
    returnTo,
    label: label || projectTitle,
  });
}
