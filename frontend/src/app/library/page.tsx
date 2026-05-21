"use client";

import React, { useState, useCallback, useMemo, useEffect, Suspense, useDeferredValue } from "react";
import Link from "next/link";
import { useQuery, useMutation, useLazyQuery } from "@apollo/client/react";
import {
  Bookmark,
  BookOpen,
  StickyNote,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  FileText,
  GitBranch,
  Search,
  Database,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  GET_BOOKMARKS,
  GET_READING_LIST,
  GET_ALL_NOTES,
  GET_COLLECTIONS,
  GET_COLLECTION_PAPERS,
  CREATE_COLLECTION,
  DELETE_COLLECTION,
  RENAME_COLLECTION,
  REMOVE_FROM_COLLECTION,
  TOGGLE_BOOKMARK,
  SET_READING_STATUS,
} from "@/lib/queries";
import { getApiUrl, readErrorMessage } from "@/lib/api";
import { getStoredActiveLibraryId, resolveInitialLibraryId, setStoredActiveLibraryId } from "@/lib/libraries";
import type { Paper, NoteItem, Collection, Library as LibraryInfo } from "@/lib/types";
import { LitReviewModal } from "@/components/research/lit-review-modal";
import { ExportMenu } from "@/components/shared/export-menu";
import { NoteRenderer, extractNoteReferences } from "@/components/shared/note-renderer";
import { QueryErrorBanner } from "@/components/shared/query-error-banner";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const API_URL = getApiUrl();

const EXTRACTION_DIMENSIONS = [
  { key: "metadata", labelKey: "library.coverage.metadata" },
  { key: "summary", labelKey: "library.coverage.summary" },
  { key: "research_question", labelKey: "library.coverage.question" },
  { key: "methods_data", labelKey: "library.coverage.methods" },
  { key: "findings", labelKey: "library.coverage.findings" },
  { key: "writing_style", labelKey: "library.coverage.style" },
  { key: "argument_logic", labelKey: "library.coverage.logic" },
  { key: "relations", labelKey: "library.coverage.relations" },
] as const;

type PaperManagerColumnKey =
  | "id"
  | "year"
  | "score"
  | "authors"
  | "venue"
  | "coverage"
  | "feedback"
  | "status"
  | "profile"
  | "fields"
  | "imported"
  | "updated";

const PAPER_MANAGER_COLUMNS: Array<{
  key: PaperManagerColumnKey;
  labelKey: string;
  width: string;
}> = [
  { key: "id", labelKey: "library.columns.id", width: "110px" },
  { key: "year", labelKey: "library.columns.year", width: "80px" },
  { key: "score", labelKey: "library.columns.score", width: "90px" },
  { key: "authors", labelKey: "library.columns.authors", width: "190px" },
  { key: "venue", labelKey: "library.columns.venue", width: "170px" },
  { key: "coverage", labelKey: "library.columns.coverage", width: "160px" },
  { key: "feedback", labelKey: "library.columns.feedback", width: "130px" },
  { key: "status", labelKey: "library.columns.status", width: "120px" },
  { key: "profile", labelKey: "library.columns.profile", width: "160px" },
  { key: "fields", labelKey: "library.columns.fields", width: "140px" },
  { key: "imported", labelKey: "library.columns.imported", width: "120px" },
  { key: "updated", labelKey: "library.columns.updated", width: "150px" },
];

const DEFAULT_VISIBLE_COLUMNS: Record<PaperManagerColumnKey, boolean> = {
  id: true,
  year: true,
  score: true,
  authors: true,
  venue: true,
  coverage: true,
  feedback: true,
  status: true,
  profile: false,
  fields: true,
  imported: true,
  updated: true,
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "to_read", label: "To Read", color: "bg-[#b88a3b]" },
  { value: "reading", label: "Reading", color: "bg-[#6f86a6]" },
  { value: "skimmed", label: "Skimmed", color: "bg-[#6f86a6]" },
  { value: "read_in_detail", label: "Read in Detail", color: "bg-[var(--forest)]" },
];

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Not set";
  const tab = STATUS_TABS.find((t) => t.value === status);
  return tab ? tab.label : status.replace(/_/g, " ");
}

function statusColor(status: string | null | undefined): string {
  if (!status) return "bg-[var(--line)]";
  const tab = STATUS_TABS.find((t) => t.value === status);
  return tab?.color ?? "bg-[var(--line)]";
}

// ---------------------------------------------------------------------------
// Loading / empty states
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  const { t } = useI18n();

  return (
    <div className="lp-card flex flex-col items-center justify-center py-16 text-center">
      <Icon className="mb-3 h-10 w-10 text-[var(--ink-4)]" />
      <p className="font-display text-2xl tracking-tight text-[var(--ink)]">{t("common.emptyTitle")}</p>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--ink-4)]">{message}</p>
    </div>
  );
}

interface PaperManagerRow {
  paper_id: string;
  title: string | null;
  authors: string[];
  year: number | null;
  fields: string[];
  triage_decision: string | null;
  average_score: number | null;
  has_card: boolean;
  imported_at: string | null;
  updated_at: string | null;
  reading_status: string | null;
  processing_status: string;
  reading_profile: string;
  venue: string | null;
  source_url: string | null;
  analysis_focuses: string[];
  extraction_status: Record<string, boolean>;
  feedback_count: number;
  attention_feedback_count: number;
  latest_feedback_type: string | null;
}

interface PaperManagerResponse {
  items: PaperManagerRow[];
  total: number;
  field_options: Array<{ value: string; count: number }>;
  library?: {
    id: number;
    name: string;
    discipline: string;
    paper_count: number;
  };
}

interface PaperManagerFeedbackItem {
  id: number;
  library_id: number;
  paper_id: string;
  dimension_key: string;
  feedback_type: string;
  rating: number | null;
  comment: string;
  action_status: string;
  created_at: string;
}

function processingTone(status: string): string {
  switch (status) {
    case "completed":
      return "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]";
    case "triaged":
    case "indexed":
      return "bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]";
    case "pending":
      return "bg-[#f4ead8] text-[#7a5a18] border-[#d6b678]";
    case "error":
    case "pdf_error":
    case "timeout":
      return "bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]";
    default:
      return "bg-[var(--paper-2)] text-[var(--ink-4)] border-[var(--line-soft)]";
  }
}

function formatProcessingLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function formatReadingProfile(value: string, fallback: string): string {
  if (!value) return fallback;
  return value.replace(/_/g, " ");
}

function formatFeedbackLabel(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.replace(/_/g, " ");
}

function feedbackTone(attentionCount: number, feedbackCount: number): string {
  if (attentionCount > 0) return "bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]";
  if (feedbackCount > 0) return "bg-[var(--paper-2)] text-[var(--ink-3)] border-[var(--line-soft)]";
  return "bg-[var(--paper-2)] text-[var(--ink-4)] border-[var(--line-soft)]";
}

function ExtractionDots({ extractionStatus }: { extractionStatus: Record<string, boolean> }) {
  const { t } = useI18n();
  const extractedLabels = EXTRACTION_DIMENSIONS
    .filter(({ key }) => Boolean(extractionStatus[key]))
    .map(({ labelKey }) => t(labelKey));
  const missingLabels = EXTRACTION_DIMENSIONS
    .filter(({ key }) => !Boolean(extractionStatus[key]))
    .map(({ labelKey }) => t(labelKey));
  const activeCount = extractedLabels.length;
  const tooltip = [
    t("library.coverage.legendShort"),
    `${t("library.coverage.extracted")}: ${
      extractedLabels.length ? extractedLabels.join(", ") : t("library.coverage.none")
    }`,
    `${t("library.coverage.missing")}: ${
      missingLabels.length ? missingLabels.join(", ") : t("library.coverage.none")
    }`,
  ].join("\n");

  return (
    <div className="flex items-center gap-2 whitespace-nowrap" title={tooltip}>
      <div className="flex flex-nowrap items-center gap-1.5">
        {EXTRACTION_DIMENSIONS.map(({ key, labelKey }) => {
          const active = Boolean(extractionStatus[key]);
          const label = t(labelKey);
          return (
            <span
              key={key}
              title={`${label}: ${active ? t("library.coverage.extracted") : t("library.coverage.missing")}`}
              className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
                active
                  ? "border-[#2c4870] bg-[#2c4870]"
                  : "border-[var(--line-soft)] bg-[var(--paper)]"
              }`}
            />
          );
        })}
      </div>
      <span className="text-[11px] text-[var(--ink-4)]">
        {t("library.coverage.count", {
          count: activeCount,
          total: EXTRACTION_DIMENSIONS.length,
        })}
      </span>
    </div>
  );
}

function PaperManagerTab() {
  const { t } = useI18n();
  const [libraries, setLibraries] = useState<LibraryInfo[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null);
  const [papers, setPapers] = useState<PaperManagerRow[]>([]);
  const [fieldOptions, setFieldOptions] = useState<Array<{ value: string; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [librariesLoading, setLibrariesLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [fieldFilter, setFieldFilter] = useState("all");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [processingStatus, setProcessingStatus] = useState("all");
  const [readingProfile, setReadingProfile] = useState("all");
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [feedbackFilter, setFeedbackFilter] = useState("all");
  const [hasCardFilter, setHasCardFilter] = useState("all");
  const [sort, setSort] = useState("updated_desc");
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] =
    useState<Record<PaperManagerColumnKey, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [batchReadingProfile, setBatchReadingProfile] = useState("auto");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [relationsMessage, setRelationsMessage] = useState("");
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackDialogPaper, setFeedbackDialogPaper] = useState<PaperManagerRow | null>(null);
  const [feedbackDialogItems, setFeedbackDialogItems] = useState<PaperManagerFeedbackItem[]>([]);
  const [feedbackDialogLoading, setFeedbackDialogLoading] = useState(false);
  const [feedbackDialogError, setFeedbackDialogError] = useState("");
  const [feedbackActionLoadingId, setFeedbackActionLoadingId] = useState<number | null>(null);
  const [feedbackDialogMessage, setFeedbackDialogMessage] = useState("");
  const [feedbackDialogReprocessLoading, setFeedbackDialogReprocessLoading] = useState(false);
  const [doiInput, setDoiInput] = useState("");
  const [doiLoading, setDoiLoading] = useState(false);
  const [doiMessage, setDoiMessage] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const selectedLibrary =
    libraries.find((library) => library.id === selectedLibraryId) ?? null;

  useEffect(() => {
    let active = true;

    async function loadLibraries() {
      setLibrariesLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/libraries`);
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Failed to load libraries"));
        }
        const data = await response.json();
        const nextLibraries = (data.libraries ?? []) as LibraryInfo[];
        if (!active) return;
        setLibraries(nextLibraries);
        const initialLibraryId =
          resolveInitialLibraryId(nextLibraries) ?? getStoredActiveLibraryId();
        setSelectedLibraryId(initialLibraryId);
        setStoredActiveLibraryId(initialLibraryId);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load libraries.");
      } finally {
        if (active) setLibrariesLoading(false);
      }
    }

    loadLibraries();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedLibraryId) return;
    let active = true;

    async function loadPapers() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (deferredSearchQuery.trim()) params.set("q", deferredSearchQuery.trim());
        if (fieldFilter !== "all") params.set("field", fieldFilter);
        if (yearMin.trim()) params.set("year_min", yearMin.trim());
        if (yearMax.trim()) params.set("year_max", yearMax.trim());
        if (processingStatus !== "all") params.set("processing_status", processingStatus);
        if (readingProfile !== "all") params.set("reading_profile", readingProfile);
        if (coverageFilter !== "all") params.set("coverage", coverageFilter);
        if (feedbackFilter !== "all") params.set("feedback", feedbackFilter);
        if (hasCardFilter !== "all") params.set("has_card", hasCardFilter === "yes" ? "true" : "false");
        params.set("sort", sort);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String((page - 1) * PAGE_SIZE));

        const response = await fetch(
          `${API_URL}/api/libraries/${selectedLibraryId}/papers?${params.toString()}`
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Failed to load library papers"));
        }
        const data = (await response.json()) as PaperManagerResponse;
        if (!active) return;
        setPapers(data.items ?? []);
        setTotal(data.total ?? 0);
        setFieldOptions(data.field_options ?? []);
      } catch (err) {
        if (!active) return;
        setPapers([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Failed to load library papers.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPapers();
    return () => {
      active = false;
    };
  }, [
    selectedLibraryId,
    deferredSearchQuery,
    fieldFilter,
    yearMin,
    yearMax,
    processingStatus,
    readingProfile,
    coverageFilter,
    feedbackFilter,
    hasCardFilter,
    sort,
    page,
    reloadNonce,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    selectedLibraryId,
    deferredSearchQuery,
    fieldFilter,
    yearMin,
    yearMax,
    processingStatus,
    readingProfile,
    coverageFilter,
    feedbackFilter,
    hasCardFilter,
    sort,
  ]);

  useEffect(() => {
    const visiblePaperIds = new Set(papers.map((paper) => paper.paper_id));
    setSelectedPaperIds((current) => {
      const next = new Set<string>();
      current.forEach((paperId) => {
        if (visiblePaperIds.has(paperId)) {
          next.add(paperId);
        }
      });
      return next;
    });
  }, [papers]);

  const visiblePaperIds = useMemo(() => papers.map((paper) => paper.paper_id), [papers]);
  const allVisibleSelected =
    visiblePaperIds.length > 0 && visiblePaperIds.every((paperId) => selectedPaperIds.has(paperId));
  const tableGridTemplate = useMemo(() => {
    const dynamicColumns = PAPER_MANAGER_COLUMNS
      .filter((column) => visibleColumns[column.key])
      .map((column) => column.width);
    return ["44px", "minmax(0,2.1fr)", ...dynamicColumns].join(" ");
  }, [visibleColumns]);

  const visibleColumnCount = useMemo(
    () => PAPER_MANAGER_COLUMNS.filter((column) => visibleColumns[column.key]).length,
    [visibleColumns]
  );

  const togglePaperSelection = useCallback((paperId: string, checked: boolean) => {
    setSelectedPaperIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(paperId);
      } else {
        next.delete(paperId);
      }
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback((checked: boolean) => {
    setSelectedPaperIds((current) => {
      const next = new Set(current);
      if (checked) {
        visiblePaperIds.forEach((paperId) => next.add(paperId));
      } else {
        visiblePaperIds.forEach((paperId) => next.delete(paperId));
      }
      return next;
    });
  }, [visiblePaperIds]);

  const toggleColumn = useCallback((column: PaperManagerColumnKey, checked: boolean) => {
    setVisibleColumns((current) => ({ ...current, [column]: checked }));
  }, []);

  const handleBatchReprocess = useCallback(async () => {
    if (!selectedLibraryId || selectedPaperIds.size === 0) return;
    setBatchLoading(true);
    setBatchMessage("");
    try {
      const response = await fetch(`${API_URL}/api/libraries/${selectedLibraryId}/papers/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_ids: Array.from(selectedPaperIds),
          reading_profile: batchReadingProfile,
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to re-run extraction"));
      }
      const payload = await response.json();
      setBatchMessage(
        `Reprocessed ${payload.processed ?? 0} paper(s), failed ${payload.failed ?? 0}.`
      );
      setSelectedPaperIds(new Set());
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setBatchMessage(err instanceof Error ? err.message : "Failed to re-run extraction.");
    } finally {
      setBatchLoading(false);
    }
  }, [batchReadingProfile, selectedLibraryId, selectedPaperIds]);

  const handleBuildRelations = useCallback(async () => {
    if (!selectedLibraryId) return;
    if (selectedPaperIds.size < 2) {
      setRelationsMessage(t("library.actions.selectAtLeastTwoForRelations"));
      return;
    }
    setRelationsLoading(true);
    setRelationsMessage("");
    const paperIds = Array.from(selectedPaperIds);
    try {
      const response = await fetch(`${API_URL}/api/pipeline/build-relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: selectedLibraryId,
          force_rebuild: true,
          paper_ids: paperIds,
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, t("library.actions.relationsFailed")));
      }
      const payload = await response.json();
      if (payload.error) {
        setRelationsMessage(String(payload.error));
      } else {
        const processed =
          typeof payload.linker?.processed === "number"
            ? payload.linker.processed
            : typeof payload.completed_papers === "number"
              ? payload.completed_papers
              : paperIds.length;
        setRelationsMessage(t("library.actions.relationsBuiltForSelected", { count: processed }));
      }
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setRelationsMessage(err instanceof Error ? err.message : t("library.actions.relationsFailed"));
    } finally {
      setRelationsLoading(false);
    }
  }, [selectedLibraryId, selectedPaperIds, t]);

  const handleImportDoi = useCallback(async () => {
    if (!selectedLibraryId || !doiInput.trim()) return;
    setDoiLoading(true);
    setDoiMessage("");
    try {
      const response = await fetch(`${API_URL}/api/libraries/${selectedLibraryId}/papers/from-doi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: doiInput.trim() }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to import DOI"));
      }
      const payload = await response.json();
      setDoiMessage(t("library.actions.doiImported", { id: payload.paper?.paper_id ?? doiInput.trim() }));
      setDoiInput("");
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setDoiMessage(err instanceof Error ? err.message : t("library.actions.doiImportFailed"));
    } finally {
      setDoiLoading(false);
    }
  }, [doiInput, selectedLibraryId, t]);

  const handleOpenFeedback = useCallback(async (paper: PaperManagerRow) => {
    if (!selectedLibraryId) return;
    setFeedbackDialogPaper(paper);
    setFeedbackDialogOpen(true);
    setFeedbackDialogLoading(true);
    setFeedbackDialogError("");
    setFeedbackDialogMessage("");
    setFeedbackDialogItems([]);
    try {
      const response = await fetch(
        `${API_URL}/api/papers/${encodeURIComponent(paper.paper_id)}/feedback?library_id=${selectedLibraryId}&limit=10`
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to load feedback"));
      }
      const payload = await response.json();
      setFeedbackDialogItems((payload.items ?? []) as PaperManagerFeedbackItem[]);
    } catch (err) {
      setFeedbackDialogError(err instanceof Error ? err.message : "Failed to load feedback.");
    } finally {
      setFeedbackDialogLoading(false);
    }
  }, [selectedLibraryId]);

  const handleResolveFeedback = useCallback(async (feedbackId: number) => {
    if (!selectedLibraryId || !feedbackDialogPaper) return;
    setFeedbackActionLoadingId(feedbackId);
    setFeedbackDialogError("");
    setFeedbackDialogMessage("");
    try {
      const response = await fetch(`${API_URL}/api/feedback/${feedbackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: selectedLibraryId,
          action_status: "resolved",
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to update feedback"));
      }
      setFeedbackDialogItems((current) =>
        current.map((item) =>
          item.id === feedbackId ? { ...item, action_status: "resolved" } : item
        )
      );
      setFeedbackDialogMessage("Feedback marked as resolved.");
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setFeedbackDialogError(err instanceof Error ? err.message : "Failed to update feedback.");
    } finally {
      setFeedbackActionLoadingId(null);
    }
  }, [feedbackDialogPaper, selectedLibraryId]);

  const handleReprocessDialogPaper = useCallback(async () => {
    if (!selectedLibraryId || !feedbackDialogPaper) return;
    setFeedbackDialogReprocessLoading(true);
    setFeedbackDialogError("");
    setFeedbackDialogMessage("");
    try {
      const response = await fetch(
        `${API_URL}/api/papers/${encodeURIComponent(feedbackDialogPaper.paper_id)}/reprocess`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            library_id: selectedLibraryId,
            reading_profile: feedbackDialogPaper.reading_profile || "auto",
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to re-run extraction"));
      }
      await response.json();
      setFeedbackDialogMessage("Re-run completed for this paper.");
      setReloadNonce((value) => value + 1);
    } catch (err) {
      setFeedbackDialogError(err instanceof Error ? err.message : "Failed to re-run extraction.");
    } finally {
      setFeedbackDialogReprocessLoading(false);
    }
  }, [feedbackDialogPaper, selectedLibraryId]);

  if (librariesLoading) return <TableSkeleton />;
  if (!selectedLibraryId || libraries.length === 0) {
    return (
      <EmptyState
        icon={Database}
        message={t("library.noLibraries")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 border-b border-[var(--line-soft)] px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-4">
            <Search className="h-4 w-4 text-[var(--ink-4)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("library.searchPlaceholder")}
              className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen((value) => !value)}
            className="h-11 shrink-0 rounded-full gap-2"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("library.actions.filters")}
          </Button>
          <Button
            type="button"
            onClick={() => setImportDialogOpen(true)}
            className="h-11 shrink-0 rounded-full gap-2 lg:ml-auto"
          >
            <FileText className="h-4 w-4" />
            {t("library.actions.addPdf")}
          </Button>
        </div>

        {filtersOpen ? (
        <>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select
            value={fieldFilter}
            onChange={(event) => setFieldFilter(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="all">{t("library.filters.allFields")}</option>
            {fieldOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} ({option.count})
              </option>
            ))}
          </select>

          <select
            value={processingStatus}
            onChange={(event) => setProcessingStatus(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="all">{t("library.filters.allStatuses")}</option>
            <option value="pending">{t("library.filters.pending")}</option>
            <option value="triaged">{t("library.filters.triaged")}</option>
            <option value="completed">{t("library.filters.completed")}</option>
            <option value="error">{t("library.filters.error")}</option>
            <option value="pdf_error">{t("library.filters.pdfError")}</option>
            <option value="timeout">{t("library.filters.timeout")}</option>
            <option value="indexed">{t("library.filters.indexedOnly")}</option>
          </select>

          <select
            value={readingProfile}
            onChange={(event) => setReadingProfile(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="all">{t("library.filters.allProfiles")}</option>
            <option value="auto">{t("library.filters.auto")}</option>
            <option value="metadata_only">{t("library.filters.metadataOnly")}</option>
            <option value="title_abstract">{t("library.filters.titleAbstract")}</option>
            <option value="full_content">{t("library.filters.fullContent")}</option>
            <option value="style_logic">{t("library.filters.styleLogic")}</option>
          </select>

          <select
            value={hasCardFilter}
            onChange={(event) => setHasCardFilter(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="all">{t("library.filters.allExtractionStates")}</option>
            <option value="yes">{t("library.filters.hasCard")}</option>
            <option value="no">{t("library.filters.noCardYet")}</option>
          </select>

          <select
            value={coverageFilter}
            onChange={(event) => setCoverageFilter(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="all">{t("library.filters.allCoverageLevels")}</option>
            <option value="core_ready">{t("library.filters.coreReady")}</option>
            <option value="partial">{t("library.filters.partial")}</option>
            <option value="minimal">{t("library.filters.minimal")}</option>
            <option value="relations_ready">{t("library.filters.relationsReady")}</option>
          </select>

          <select
            value={feedbackFilter}
            onChange={(event) => setFeedbackFilter(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="all">{t("library.filters.allFeedbackStates")}</option>
            <option value="has_feedback">{t("library.filters.hasFeedback")}</option>
            <option value="needs_attention">{t("library.filters.needsAttention")}</option>
            <option value="good">{t("library.filters.good")}</option>
            <option value="too_shallow">{t("library.filters.tooShallow")}</option>
            <option value="incorrect">{t("library.filters.incorrect")}</option>
            <option value="missing">{t("library.filters.missing")}</option>
            <option value="format_issue">{t("library.filters.formatIssue")}</option>
          </select>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="h-10 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
          >
            <option value="updated_desc">{t("library.filters.recentlyUpdated")}</option>
            <option value="imported_desc">{t("library.filters.recentlyImported")}</option>
            <option value="year_desc">{t("library.filters.newestPapers")}</option>
            <option value="year_asc">{t("library.filters.oldestPapers")}</option>
            <option value="score_desc">{t("library.filters.highestScore")}</option>
            <option value="title_asc">{t("library.filters.titleAZ")}</option>
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={yearMin}
              onChange={(event) => setYearMin(event.target.value)}
              placeholder={t("library.filters.yearFrom")}
              className="h-10 min-w-0 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
            />
            <input
              type="number"
              value={yearMax}
              onChange={(event) => setYearMax(event.target.value)}
              placeholder={t("library.filters.yearTo")}
              className="h-10 min-w-0 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-xs text-[var(--ink)]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3">
            <input
              type="text"
              value={doiInput}
              onChange={(event) => setDoiInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleImportDoi();
                }
              }}
              placeholder={t("library.actions.doiPlaceholder")}
              className="w-full bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-4)]"
            />
            <button
              type="button"
              onClick={() => void handleImportDoi()}
              disabled={doiLoading || !doiInput.trim()}
              className="shrink-0 text-xs font-medium text-[var(--forest)] disabled:text-[var(--ink-4)]"
            >
              {doiLoading ? t("library.actions.importing") : t("library.actions.addDoi")}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setFieldFilter("all");
              setYearMin("");
              setYearMax("");
              setProcessingStatus("all");
              setReadingProfile("all");
              setCoverageFilter("all");
              setFeedbackFilter("all");
              setHasCardFilter("all");
              setSort("updated_desc");
              setSelectedPaperIds(new Set());
              setBatchMessage("");
              setPage(1);
            }}
            className="h-10 rounded-full gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("library.actions.reset")}
          </Button>
        </div>
        </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--ink-4)]">
        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5">
          {t("library.status.discipline")}:{" "}
          <span className="text-[var(--ink)]">{selectedLibrary?.discipline || t("library.uncategorized")}</span>
        </span>
        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5">
          {t("library.visiblePapers", { count: total })}
        </span>
        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5">
          {t("library.totalInLibrary", { count: selectedLibrary?.paper_count ?? 0 })}
        </span>
      </div>

      {doiMessage ? (
        <div className="px-4">
          <p className="text-xs text-[var(--ink-4)]">{doiMessage}</p>
        </div>
      ) : null}

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.importDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("library.importDialog.body")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {t("common.actions.cancel")}
            </Button>
            <Button asChild>
              <Link href="/pipeline">{t("library.importDialog.openPipeline")}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && <QueryErrorBanner error={{ message: error }} message={t("library.errors.failedToLoadPaperManager")} />}

      {loading ? (
        <TableSkeleton />
      ) : papers.length === 0 ? (
        <EmptyState
          icon={Database}
          message={t("library.emptyFiltered")}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--line-soft)] bg-[var(--paper-2)]/20 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-4)]">
              <label
                className="flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5"
                title={t("library.actions.selectVisibleHelp")}
              >
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                  className="rounded border-[var(--line-soft)]"
                />
                {t("library.actions.selectVisible")}
              </label>
              <span className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5">
                {t("library.actions.selectedCount", { count: selectedPaperIds.size })}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <ExportMenu
                paperIds={Array.from(selectedPaperIds)}
                label={t("library.actions.exportReferences")}
              />
              <details className="relative">
                <summary
                  className="flex h-10 cursor-pointer list-none items-center justify-center rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-sm text-[var(--ink)] whitespace-nowrap"
                  title={t("library.columns.showColumnsHelp")}
                >
                  {t("library.columns.showColumns", { count: visibleColumnCount })}
                </summary>
                <div className="absolute right-0 z-20 mt-2 min-w-[220px] rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-3 shadow-[var(--shadow-2)]">
                  <div className="space-y-2">
                    {PAPER_MANAGER_COLUMNS.map((column) => (
                      <label
                        key={column.key}
                        className="flex items-center justify-between gap-3 rounded-[var(--r)] px-2 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--paper-2)]/60"
                      >
                        <span>{t(column.labelKey)}</span>
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.key]}
                          onChange={(event) => toggleColumn(column.key, event.target.checked)}
                          className="rounded border-[var(--line-soft)]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </details>
              <Button
                type="button"
                variant="outline"
                onClick={handleBuildRelations}
                disabled={relationsLoading || selectedPaperIds.size < 2}
                className="gap-1.5 whitespace-nowrap"
                title={t("library.actions.buildRelationsHelp")}
              >
                <GitBranch className={`h-3.5 w-3.5 ${relationsLoading ? "animate-pulse" : ""}`} />
                {relationsLoading ? t("library.actions.buildingRelations") : t("library.actions.buildRelations")}
              </Button>
              <select
                value={batchReadingProfile}
                onChange={(event) => setBatchReadingProfile(event.target.value)}
                className="h-10 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 text-sm text-[var(--ink)]"
                disabled={batchLoading}
              >
                <option value="auto">{t("library.filters.auto")}</option>
                <option value="metadata_only">{t("library.filters.metadataOnly")}</option>
                <option value="title_abstract">{t("library.filters.titleAbstract")}</option>
                <option value="full_content">{t("library.filters.fullContent")}</option>
                <option value="style_logic">{t("library.filters.styleLogic")}</option>
              </select>
              <Button
                type="button"
                onClick={handleBatchReprocess}
                disabled={batchLoading || selectedPaperIds.size === 0}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${batchLoading ? "animate-spin" : ""}`} />
                {batchLoading ? t("library.actions.rerunning") : t("library.actions.rerunSelected")}
              </Button>
            </div>
          </div>

          {batchMessage ? (
            <div className="px-4 pt-3">
              <p className="text-xs text-[var(--ink-4)]">{batchMessage}</p>
            </div>
          ) : null}

          {relationsMessage ? (
            <div className="px-4">
              <p className="text-xs text-[var(--ink-4)]">{relationsMessage}</p>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <div className="min-w-[1500px]">
              <div
                className="grid gap-3 border-b border-[var(--line-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]"
                style={{ gridTemplateColumns: tableGridTemplate }}
              >
                <span />
                <span>{t("library.columns.paper")}</span>
                {visibleColumns.id ? <span>{t("library.columns.id")}</span> : null}
                {visibleColumns.year ? <span>{t("library.columns.year")}</span> : null}
                {visibleColumns.score ? <span>{t("library.columns.score")}</span> : null}
                {visibleColumns.authors ? <span>{t("library.columns.authors")}</span> : null}
                {visibleColumns.venue ? <span>{t("library.columns.venue")}</span> : null}
                {visibleColumns.coverage ? <span>{t("library.columns.coverage")}</span> : null}
                {visibleColumns.feedback ? <span>{t("library.columns.feedback")}</span> : null}
                {visibleColumns.status ? <span>{t("library.columns.status")}</span> : null}
                {visibleColumns.profile ? <span>{t("library.columns.profile")}</span> : null}
                {visibleColumns.fields ? <span>{t("library.columns.fields")}</span> : null}
                {visibleColumns.imported ? <span>{t("library.columns.imported")}</span> : null}
                {visibleColumns.updated ? <span>{t("library.columns.updated")}</span> : null}
              </div>
              <div className="divide-y divide-[var(--line-soft)]">
                {papers.map((paper) => (
                  <div
                    key={paper.paper_id}
                    className="grid gap-3 px-4 py-3 transition-colors hover:bg-[var(--paper-2)]/40"
                    style={{ gridTemplateColumns: tableGridTemplate }}
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedPaperIds.has(paper.paper_id)}
                        onChange={(event) => togglePaperSelection(paper.paper_id, event.target.checked)}
                        className="rounded border-[var(--line-soft)]"
                      />
                    </div>

                    <div className="flex min-w-0 items-center">
                      <Link
                        href={`/paper/${paper.paper_id}`}
                        className="block truncate text-sm font-medium text-[var(--ink)] hover:text-[#2c4870]"
                      >
                        {paper.title || paper.paper_id}
                      </Link>
                    </div>

                    {visibleColumns.id ? (
                      <div className="flex items-center font-mono text-[11px] text-[var(--ink-4)]">
                        {paper.paper_id}
                      </div>
                    ) : null}

                    {visibleColumns.year ? (
                      <div className="flex items-center text-xs text-[var(--ink-4)]">
                        {paper.year ?? "—"}
                      </div>
                    ) : null}

                    {visibleColumns.score ? (
                      <div className="flex items-center text-xs text-[var(--ink-4)]">
                        {paper.average_score != null ? (
                          <span title={t("library.paperMeta.scoreHelp")}>
                            {paper.average_score.toFixed(1)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </div>
                    ) : null}

                    {visibleColumns.authors ? (
                      <div className="flex min-w-0 items-center">
                        <span className="truncate text-xs text-[var(--ink-4)]" title={paper.authors.join(", ")}>
                          {paper.authors.length > 0
                            ? `${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}`
                            : "—"}
                        </span>
                      </div>
                    ) : null}

                    {visibleColumns.venue ? (
                      <div className="flex min-w-0 items-center">
                        <span className="truncate text-xs text-[var(--ink-4)]" title={paper.venue ?? undefined}>
                          {paper.venue || "—"}
                        </span>
                      </div>
                    ) : null}

                    {visibleColumns.coverage ? (
                      <div className="flex items-center">
                        <ExtractionDots extractionStatus={paper.extraction_status} />
                      </div>
                    ) : null}

                    {visibleColumns.feedback ? (
                      <div className="flex items-center">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${feedbackTone(
                              paper.attention_feedback_count,
                              paper.feedback_count
                            )}`}
                          >
                            {paper.attention_feedback_count > 0
                              ? t("library.feedback.attention", { count: paper.attention_feedback_count })
                              : paper.feedback_count > 0
                                ? formatFeedbackLabel(paper.latest_feedback_type, t("library.feedback.hasFeedback"))
                                : t("library.feedback.none")}
                          </span>
                          {paper.feedback_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenFeedback(paper)}
                              className="block text-[11px] text-[#2c4870] hover:text-[#223a5e]"
                            >
                              {t("library.feedback.viewCount", { count: paper.feedback_count })}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {visibleColumns.status ? (
                      <div className="flex items-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${processingTone(paper.processing_status)}`}>
                          {formatProcessingLabel(paper.processing_status)}
                        </span>
                      </div>
                    ) : null}

                    {visibleColumns.profile ? (
                      <div className="flex items-center">
                        <span className="text-xs text-[var(--ink-4)]">
                          {formatReadingProfile(paper.reading_profile, t("library.profile.notSet"))}
                        </span>
                      </div>
                    ) : null}

                    {visibleColumns.fields ? (
                      <div className="flex items-center">
                        <div className="flex flex-wrap gap-1">
                          {paper.fields.slice(0, 2).map((item) => (
                            <Badge key={item} variant="paper" className="text-[10px] px-1.5 py-0">
                              {item}
                            </Badge>
                          ))}
                          {paper.fields.length > 2 ? (
                            <span className="text-[11px] text-[var(--ink-4)]">
                              +{paper.fields.length - 2}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {visibleColumns.imported ? (
                      <div className="flex items-center text-xs text-[var(--ink-4)]">
                        {paper.imported_at ? new Date(paper.imported_at).toLocaleDateString() : "—"}
                      </div>
                    ) : null}

                    {visibleColumns.updated ? (
                      <div className="flex items-center text-xs text-[var(--ink-4)]">
                        {paper.updated_at ? new Date(paper.updated_at).toLocaleString() : "—"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />

          <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Feedback for {feedbackDialogPaper?.paper_id ?? "paper"}
                </DialogTitle>
                <DialogDescription>
                  Review the latest extraction feedback before deciding whether to re-run this paper or rebuild relations.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[var(--ink-4)]">
                  {feedbackDialogPaper?.title || "Review extraction feedback and decide the next action."}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleReprocessDialogPaper}
                  disabled={feedbackDialogReprocessLoading || !feedbackDialogPaper}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${feedbackDialogReprocessLoading ? "animate-spin" : ""}`}
                  />
                  {feedbackDialogReprocessLoading ? "Re-running..." : "Re-run this paper"}
                </Button>
              </div>

              {feedbackDialogMessage ? (
                <p className="text-xs text-[var(--ink-4)]">{feedbackDialogMessage}</p>
              ) : null}

              {feedbackDialogLoading ? (
                <div className="space-y-2 py-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : feedbackDialogError ? (
                <p className="text-sm text-[#8a3318]">{feedbackDialogError}</p>
              ) : feedbackDialogItems.length === 0 ? (
                <p className="text-sm text-[var(--ink-4)]">No feedback found for this paper.</p>
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {feedbackDialogItems.map((item) => (
                    <div key={item.id} className="rounded-[var(--r)] border border-[var(--line-soft)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {item.dimension_key ? formatFeedbackLabel(item.dimension_key, "General") : "General"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {formatFeedbackLabel(item.feedback_type, t("library.feedback.hasFeedback"))}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {formatFeedbackLabel(item.action_status, "Open")}
                        </Badge>
                        {item.rating ? (
                          <span className="text-[11px] text-[var(--ink-4)]">{item.rating}/5</span>
                        ) : null}
                        <span className="text-[11px] text-[var(--ink-4)]">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      {item.comment ? (
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{item.comment}</p>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--ink-4)]">No comment provided.</p>
                      )}
                      {item.action_status !== "resolved" ? (
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleResolveFeedback(item.id)}
                            disabled={feedbackActionLoadingId === item.id}
                          >
                            {feedbackActionLoadingId === item.id ? "Updating..." : "Resolve"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter>
                {feedbackDialogPaper ? (
                  <Button asChild variant="outline">
                    <Link href={`/paper/${feedbackDialogPaper.paper_id}`}>Open paper</Link>
                  </Button>
                ) : null}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paper row (shared by bookmarks, reading list, collection papers)
// ---------------------------------------------------------------------------

function PaperRow({ paper }: { paper: Paper }) {
  return (
    <Link
      href={`/paper/${paper.paperId}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-[var(--line-soft)] hover:bg-[var(--paper-2)]/50 transition-colors"
    >
      <span className="font-mono text-xs text-[var(--ink-4)] w-20 shrink-0">
        {paper.paperId}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--ink)] truncate">
          {paper.title ?? "Untitled"}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {paper.year && (
            <span className="text-xs text-[var(--ink-4)]">{paper.year}</span>
          )}
          {(paper.fields ?? []).slice(0, 2).map((f) => (
            <Badge key={f} variant="paper" className="text-[10px] px-1.5 py-0">
              {f}
            </Badge>
          ))}
        </div>
      </div>
      {paper.readingStatus && (
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`h-2 w-2 rounded-full ${statusColor(paper.readingStatus)}`} />
          <span className="text-xs text-[var(--ink-4)]">{statusLabel(paper.readingStatus)}</span>
        </span>
      )}
      {paper.averageScore !== null && paper.averageScore !== undefined && (
        <span className="text-xs font-semibold text-[var(--ink-4)] tabular-nums w-8 text-right shrink-0">
          {paper.averageScore.toFixed(1)}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-[var(--line-soft)] px-4 py-3">
      <span className="text-xs text-[var(--ink-4)]">
        Showing {rangeStart}&ndash;{rangeEnd} of {total} item{total !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-[var(--ink-4)] px-2">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookmarks tab content
// ---------------------------------------------------------------------------

function BookmarksTab() {
  const [page, setPage] = useState(1);
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const { data, loading, error, refetch } = useQuery<{
    bookmarks: { items: Paper[]; total: number };
  }>(GET_BOOKMARKS, {
    variables: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  });

  const [toggleBookmark] = useMutation(TOGGLE_BOOKMARK);

  const papers = data?.bookmarks?.items ?? [];
  const total = data?.bookmarks?.total ?? 0;

  const filteredPapers = papers.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.title?.toLowerCase().includes(q) || p.paperId.toLowerCase().includes(q));
  });

  if (loading) return <TableSkeleton />;
  if (error) return <QueryErrorBanner error={error} message="Failed to load bookmarks." />;
  if (papers.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        message="No bookmarks yet. Bookmark papers from the paper detail page."
      />
    );
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--line-soft)]">
        <input
          type="text"
          placeholder="Search bookmarks by title or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
        />
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--line-soft)]">
        <label className="flex items-center gap-2 text-sm text-[var(--ink-4)]">
          <input
            type="checkbox"
            checked={selectedPapers.size === filteredPapers.length && filteredPapers.length > 0}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedPapers(new Set(filteredPapers.map((b: Paper) => b.paperId)));
              } else {
                setSelectedPapers(new Set());
              }
            }}
            className="rounded border-[var(--line-soft)]"
          />
          Select all
        </label>
        <ExportMenu paperIds={filteredPapers.map((p) => p.paperId)} label="Export" compact />
      </div>
      {selectedPapers.size > 0 && (
        <div className="flex items-center gap-3 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-2 mb-3 mx-4 mt-2">
          <span className="text-sm font-medium">{selectedPapers.size} selected</span>
          <ExportMenu paperIds={Array.from(selectedPapers)} label="Export" compact />
          <button
            onClick={async () => {
              const pids = Array.from(selectedPapers);
              try {
                await Promise.all(pids.map(pid =>
                  toggleBookmark({ variables: { paperId: pid } })
                ));
              } catch (e) {
                console.error("Some removals failed:", e);
              }
              setSelectedPapers(new Set());
              refetch();
            }}
            className="text-xs text-[#8a3318] hover:underline"
          >
            Remove all
          </button>
          <button
            onClick={() => setSelectedPapers(new Set())}
            className="ml-auto text-xs text-[var(--ink-4)] hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}
      <div className="divide-y divide-[var(--line-soft)]">
        {filteredPapers.map((p) => (
          <div key={p.paperId} className="flex items-center gap-2 px-4">
            <input
              type="checkbox"
              checked={selectedPapers.has(p.paperId)}
              onChange={(e) => {
                const next = new Set(selectedPapers);
                if (e.target.checked) next.add(p.paperId);
                else next.delete(p.paperId);
                setSelectedPapers(next);
              }}
              className="rounded border-[var(--line-soft)] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <PaperRow paper={p} />
            </div>
          </div>
        ))}
      </div>
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reading list tab content
// ---------------------------------------------------------------------------

function ReadingListTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const queryStatus = statusFilter === "all" ? null : statusFilter;

  const { data, loading, error, refetch } = useQuery<{
    readingList: { items: Paper[]; total: number };
  }>(GET_READING_LIST, {
    variables: {
      status: queryStatus,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
  });

  const [setReadingStatus] = useMutation(SET_READING_STATUS);

  const papers = data?.readingList?.items ?? [];
  const total = data?.readingList?.total ?? 0;

  return (
    <div>
      {/* Status sub-tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--line-soft)] overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-[var(--ink)] text-[var(--paper)]"
                : "text-[var(--ink-4)] hover:bg-[var(--paper-2)]"
            }`}
          >
            {tab.color && (
              <span className={`h-2 w-2 rounded-full ${tab.color}`} />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {error && <QueryErrorBanner error={error} message="Failed to load reading list." />}

      {loading ? (
        <TableSkeleton />
      ) : papers.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          message={
            statusFilter === "all"
              ? "No papers in your reading list yet."
              : `No papers with status "${statusLabel(statusFilter)}".`
          }
        />
      ) : (
        <>
          <div className="divide-y divide-[var(--line-soft)]">
            {papers.map((p) => (
              <div key={p.paperId} className="flex items-center">
                <div className="flex-1 min-w-0">
                  <PaperRow paper={p} />
                </div>
                <select
                  value={p.readingStatus ?? "to_read"}
                  onChange={async (e) => {
                    await setReadingStatus({
                      variables: { paperId: p.paperId, status: e.target.value },
                    });
                    refetch();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs rounded border border-[var(--line-soft)] bg-[var(--paper)] px-1.5 py-0.5 text-[var(--ink-4)] mr-4 shrink-0"
                >
                  <option value="to_read">To Read</option>
                  <option value="reading">Reading</option>
                  <option value="skimmed">Skimmed</option>
                  <option value="read_in_detail">Read in Detail</option>
                </select>
              </div>
            ))}
          </div>
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes tab content
// ---------------------------------------------------------------------------

function NotesTab() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, loading, error } = useQuery<{
    allNotes: { items: NoteItem[]; total: number };
  }>(GET_ALL_NOTES, {
    variables: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  });

  const notes = data?.allNotes?.items ?? [];
  const total = data?.allNotes?.total ?? 0;

  const filteredNotes = notes.filter(n => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (n.note?.toLowerCase().includes(q) || n.entityId.toLowerCase().includes(q));
  });

  if (loading) return <TableSkeleton />;
  if (error) return <QueryErrorBanner error={error} message="Failed to load notes." />;
  if (notes.length === 0) {
    return (
      <EmptyState
        icon={StickyNote}
        message="No notes yet. Add notes from the paper detail page."
      />
    );
  }

  return (
    <div>
      <div className="px-4 py-2 border-b border-[var(--line-soft)]">
        <input
          type="text"
          placeholder="Search notes by content or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
        />
      </div>
      <div className="divide-y divide-[var(--line-soft)]">
        {filteredNotes.map((note) => {
          const href =
            note.entityType === "paper"
              ? `/paper/${note.entityId}`
              : note.entityType === "atom"
              ? `/atom/${note.entityId}`
              : "#";
          return (
            <div
              key={`${note.entityType}-${note.entityId}`}
              className="block px-4 py-3 hover:bg-[var(--paper-2)]/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {note.entityType}
                </Badge>
                <span className="font-mono text-xs text-[var(--ink-4)]" title={note.entityId}>
                  {note.entityId}
                </span>
                {(() => {
                  const refs = extractNoteReferences(note.note);
                  const totalRefs = refs.papers.length + refs.atoms.length;
                  return totalRefs > 0 ? (
                    <span className="text-[10px] text-[#2c4870]">
                      {totalRefs} link{totalRefs !== 1 ? "s" : ""}
                    </span>
                  ) : null;
                })()}
                {note.updatedAt && (
                  <span className="text-[10px] text-[var(--ink-4)] ml-auto">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                )}
                <Link href={href} className="text-[10px] text-[#2c4870] hover:text-[#223a5e]">
                  Open
                </Link>
              </div>
              <div className="text-sm text-[var(--ink-4)] line-clamp-2">
                <NoteRenderer content={note.note} />
              </div>
            </div>
          );
        })}
      </div>
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections tab content
// ---------------------------------------------------------------------------

function CollectionsTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [viewingCollection, setViewingCollection] = useState<Collection | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [litReviewOpen, setLitReviewOpen] = useState(false);
  const [litReviewPaperIds, setLitReviewPaperIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const { data, loading, error, refetch } = useQuery<{
    collections: Collection[];
  }>(GET_COLLECTIONS);

  const { data: papersData, loading: papersLoading, error: papersError } = useQuery<{
    collectionPapers: { items: Paper[]; total: number };
  }>(GET_COLLECTION_PAPERS, {
    variables: {
      collectionId: viewingCollection?.id,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    skip: !viewingCollection,
  });

  const [fetchAllPapers] = useLazyQuery<{
    collectionPapers: { items: Paper[]; total: number };
  }>(GET_COLLECTION_PAPERS);

  const [createMut] = useMutation(CREATE_COLLECTION);
  const [deleteMut] = useMutation(DELETE_COLLECTION);
  const [renameMut] = useMutation(RENAME_COLLECTION);
  const [removeFromMut] = useMutation(REMOVE_FROM_COLLECTION);

  const collections = data?.collections ?? [];
  const papers = useMemo(
    () => papersData?.collectionPapers?.items ?? [],
    [papersData?.collectionPapers?.items]
  );
  const papersTotal = papersData?.collectionPapers?.total ?? 0;

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createMut({ variables: { name: newName.trim(), description: newDesc.trim() } });
    setCreateOpen(false);
    setNewName("");
    setNewDesc("");
    refetch();
  }, [newName, newDesc, createMut, refetch]);

  const handleRename = useCallback(async () => {
    if (!selectedCollection || !newName.trim()) return;
    await renameMut({ variables: { id: selectedCollection.id, name: newName.trim() } });
    setRenameOpen(false);
    setNewName("");
    if (viewingCollection?.id === selectedCollection.id) {
      setViewingCollection({ ...viewingCollection, name: newName.trim() });
    }
    refetch();
  }, [selectedCollection, newName, renameMut, viewingCollection, refetch]);

  const handleDelete = useCallback(async () => {
    if (!selectedCollection) return;
    await deleteMut({ variables: { id: selectedCollection.id } });
    setDeleteOpen(false);
    if (viewingCollection?.id === selectedCollection.id) {
      setViewingCollection(null);
    }
    refetch();
  }, [selectedCollection, deleteMut, viewingCollection, refetch]);

  const handleRemovePaper = useCallback(
    async (paperId: string) => {
      if (!viewingCollection) return;
      await removeFromMut({
        variables: { collectionId: viewingCollection.id, paperId },
      });
      refetch();
    },
    [viewingCollection, removeFromMut, refetch]
  );

  const handleOpenLitReview = useCallback(async () => {
    if (!viewingCollection) return;
    // Fetch ALL paper IDs in the collection, not just the current page
    const totalCount = papersTotal || viewingCollection.paperCount || 0;
    if (totalCount <= PAGE_SIZE) {
      // Current page already has all papers
      setLitReviewPaperIds(papers.map((p) => p.paperId));
    } else {
      // Fetch all papers for this collection
      const { data: allData } = await fetchAllPapers({
        variables: {
          collectionId: viewingCollection.id,
          limit: totalCount,
          offset: 0,
        },
      });
      const allIds = (allData?.collectionPapers?.items ?? []).map((p) => p.paperId);
      setLitReviewPaperIds(allIds);
    }
    setLitReviewOpen(true);
  }, [viewingCollection, papers, papersTotal, fetchAllPapers]);

  if (loading) return <TableSkeleton />;
  if (error) return <QueryErrorBanner error={error} message="Failed to load collections." />;

  // Viewing a specific collection's papers
  if (viewingCollection) {
    return (
      <div>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line-soft)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setViewingCollection(null); setPage(1); }}
            className="h-7 w-7 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--ink)] truncate">
              {viewingCollection.name}
            </h3>
            {viewingCollection.description && (
              <p className="text-xs text-[var(--ink-4)] truncate">{viewingCollection.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu paperIds={papers.map((p) => p.paperId)} label="Export" compact />
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenLitReview}
              disabled={papers.length === 0}
              className="text-xs gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Generate Lit Review
            </Button>
          </div>
        </div>

        {papersError && <QueryErrorBanner error={papersError} message="Failed to load collection papers." />}

        {papersLoading ? (
          <TableSkeleton />
        ) : papers.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            message="No papers in this collection yet. Add papers from the paper detail page."
          />
        ) : (
          <>
            <div className="divide-y divide-[var(--line-soft)]">
              {papers.map((p) => (
                <div key={p.paperId} className="flex items-center">
                  <div className="flex-1">
                    <PaperRow paper={p} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleRemovePaper(p.paperId);
                    }}
                    className="px-3 text-[var(--ink-4)] hover:text-[var(--rust)] transition-colors shrink-0"
                    title="Remove from collection"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Pagination
              page={page}
              total={papersTotal}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}

        {litReviewOpen && (
          <LitReviewModal
            open={litReviewOpen}
            onClose={() => setLitReviewOpen(false)}
            paperIds={litReviewPaperIds}
          />
        )}
      </div>
    );
  }

  // Collection list
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line-soft)]">
        <span className="text-xs text-[var(--ink-4)]">
          {collections.length} collection{collections.length !== 1 ? "s" : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setNewName(""); setNewDesc(""); setCreateOpen(true); }}
          className="text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New Collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          message="No collections yet. Create one to organize your papers."
        />
      ) : (
        <div className="divide-y divide-[var(--line-soft)]">
          {collections.map((col) => (
            <div
              key={col.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--paper-2)]/50 transition-colors cursor-pointer"
              onClick={() => { setViewingCollection(col); setPage(1); }}
            >
              <FolderOpen className="h-5 w-5 text-[#2c4870] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ink)] truncate">
                  {col.name}
                </p>
                {col.description && (
                  <p className="text-xs text-[var(--ink-4)] truncate">{col.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {col.paperCount} paper{col.paperCount !== 1 ? "s" : ""}
              </Badge>
              <span className="text-[10px] text-[var(--ink-4)] shrink-0">
                {new Date(col.createdAt).toLocaleDateString()}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCollection(col);
                    setNewName(col.name);
                    setRenameOpen(true);
                  }}
                  className="p-1 text-[var(--ink-4)] hover:text-[var(--ink-4)] transition-colors"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCollection(col);
                    setDeleteOpen(true);
                  }}
                  className="p-1 text-[var(--ink-4)] hover:text-[var(--rust)] transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Collection</DialogTitle>
            <DialogDescription>
              Create a collection to organize related papers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection name"
              className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)]"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)] resize-none"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Collection</DialogTitle>
            <DialogDescription>
              Enter a new name for &ldquo;{selectedCollection?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New name"
            className="w-full rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{selectedCollection?.name}&rdquo;?
              This will not delete the papers themselves.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library page content
// ---------------------------------------------------------------------------

function LibraryContent() {
  const [activeTab, setActiveTab] = useState("papers");
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-11 gap-1 p-1">
          <TabsTrigger value="papers" className="gap-1.5 px-4 text-sm">
            <Database className="h-3.5 w-3.5" />
            {t("library.tabs.papers")}
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="gap-1.5 px-4 text-sm">
            <Bookmark className="h-3.5 w-3.5" />
            {t("library.tabs.bookmarks")}
          </TabsTrigger>
          <TabsTrigger value="reading" className="gap-1.5 px-4 text-sm">
            <BookOpen className="h-3.5 w-3.5" />
            {t("library.tabs.reading")}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 px-4 text-sm">
            <StickyNote className="h-3.5 w-3.5" />
            {t("library.tabs.notes")}
          </TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5 px-4 text-sm">
            <FolderOpen className="h-3.5 w-3.5" />
            {t("library.tabs.collections")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="lp-card overflow-hidden p-0">
        <CardContent className="p-0">
          {activeTab === "papers" && <PaperManagerTab />}
          {activeTab === "bookmarks" && <BookmarksTab />}
          {activeTab === "reading" && <ReadingListTab />}
          {activeTab === "notes" && <NotesTab />}
          {activeTab === "collections" && <CollectionsTab />}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------------------

export default function LibraryPage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="lp-card space-y-3 px-6 py-6">
            <p className="section-kicker">{t("library.operationsKicker")}</p>
            <h2 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
              {t("library.heroTitle")}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-[var(--ink-4)] sm:text-[15px]">
              {t("library.fallbackBody")}
            </p>
          </div>
          <div className="lp-card h-96 animate-pulse bg-[var(--paper-2)]/40" />
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}
