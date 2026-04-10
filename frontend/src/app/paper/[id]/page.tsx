"use client";

import { use, useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useLazyQuery } from "@apollo/client/react";
import {
  ArrowLeft,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  Lightbulb,
  Loader2,
  FolderPlus,
  MessageCircle,
  Plus,
  Swords,
  GitBranch,
  Scale,
  X,
} from "lucide-react";

import {
  GET_PAPER,
  TOGGLE_BOOKMARK,
  SET_READING_STATUS,
  SAVE_NOTE,
  GET_RELATED_BY_AXIS,
  GET_COLLECTIONS,
  GET_PAPER_COLLECTIONS,
  ADD_TO_COLLECTION,
  REMOVE_FROM_COLLECTION,
  CREATE_COLLECTION,
  GET_USER_IDEAS,
  ADD_PAPER_TO_IDEA,
  REMOVE_PAPER_FROM_IDEA,
} from "@/lib/queries";
import {
  buildAtomDetailHref,
  buildCompareHref,
  buildEntityGraphHref,
  buildExplorerAtomHref,
  buildExplorerPaperHref,
  buildPaperDetailHref,
} from "@/lib/navigation";
import type { Paper, RelatedPaper, Collection, PaperDebate, BacklinkNote } from "@/lib/types";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { SectionCard } from "@/components/paper/section-card";
import { ScoreRadar } from "@/components/paper/score-radar";
import { ScoreBars } from "@/components/paper/score-bars";
import { AtomChips } from "@/components/paper/atom-chips";
import { PaperChat } from "@/components/paper/paper-chat";
import { NoteRenderer } from "@/components/shared/note-renderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 4.5) return "text-green-600";
  if (score >= 3.5) return "text-blue-600";
  return "text-gray-500";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-gray-100";
  if (score >= 4.5) return "bg-green-50";
  if (score >= 3.5) return "bg-blue-50";
  return "bg-gray-50";
}

function triageBadgeVariant(
  decision: string
): "default" | "secondary" | "destructive" | "outline" {
  const d = decision.toLowerCase();
  if (d === "accept" || d === "deep_read" || d === "deep read")
    return "default";
  if (d === "reject") return "destructive";
  return "secondary";
}

const READING_STATUS_OPTIONS = [
  { value: "not_set", label: "Not read", color: "bg-gray-300" },
  { value: "to_read", label: "To read", color: "bg-amber-400" },
  { value: "reading", label: "Reading", color: "bg-blue-400" },
  { value: "skimmed", label: "Skimmed", color: "bg-violet-400" },
  { value: "read_in_detail", label: "Read in detail", color: "bg-green-500" },
];

function statusColor(status: string | null | undefined): string {
  if (!status) return "bg-gray-300";
  const opt = READING_STATUS_OPTIONS.find((o) => o.value === status);
  return opt ? opt.color : "bg-gray-300";
}

/** Order in which card sections should appear. */
const SECTION_ORDER = [
  "research_question",
  "identification_and_method",
  "key_findings",
  "what_makes_this_paper_good",
  "limitations_and_open_questions",
  "china_applicability",
];

// ---------------------------------------------------------------------------
// Add to Collection dropdown
// ---------------------------------------------------------------------------

function AddToCollectionDropdown({ paperId }: { paperId: string }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: collectionsData, refetch: refetchCollections } = useQuery<{
    collections: Collection[];
  }>(GET_COLLECTIONS, { skip: !open });

  const { data: paperColsData, refetch: refetchPaperCols } = useQuery<{
    paperCollections: Collection[];
  }>(GET_PAPER_COLLECTIONS, { variables: { paperId }, skip: !open });

  const [addToCol] = useMutation(ADD_TO_COLLECTION);
  const [removeFromCol] = useMutation(REMOVE_FROM_COLLECTION);
  const [createCol] = useMutation(CREATE_COLLECTION);

  const collections = collectionsData?.collections ?? [];
  const paperCollectionIds = useMemo(
    () => new Set((paperColsData?.paperCollections ?? []).map((c) => c.id)),
    [paperColsData?.paperCollections]
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = useCallback(
    async (colId: number) => {
      if (paperCollectionIds.has(colId)) {
        await removeFromCol({ variables: { collectionId: colId, paperId } });
      } else {
        await addToCol({ variables: { collectionId: colId, paperId } });
      }
      refetchPaperCols();
      refetchCollections();
    },
    [paperId, paperCollectionIds, addToCol, removeFromCol, refetchPaperCols, refetchCollections]
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const result = await createCol({ variables: { name: newName.trim() } });
    const created = (result.data as { createCollection: Collection } | undefined)?.createCollection;
    if (created) {
      await addToCol({ variables: { collectionId: created.id, paperId } });
    }
    setNewName("");
    setCreating(false);
    refetchCollections();
    refetchPaperCols();
  }, [newName, createCol, addToCol, paperId, refetchCollections, refetchPaperCols]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5"
      >
        <FolderPlus className="h-4 w-4" />
        Collection
        <ChevronDown className="h-3 w-3" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-card shadow-lg py-1">
          {collections.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No collections yet.</p>
          )}
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => handleToggle(col.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  paperCollectionIds.has(col.id)
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-border"
                }`}
              >
                {paperCollectionIds.has(col.id) && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate flex-1">{col.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{col.paperCount}</span>
            </button>
          ))}

          <div className="border-t border-border mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name"
                  className="w-full rounded border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="rounded bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-40"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); }}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Collection
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add to User Idea dropdown
// ---------------------------------------------------------------------------

function AddToIdeaDropdown({ paperId }: { paperId: string }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: ideasData, refetch: refetchIdeas } = useQuery<{
    userIdeas: { id: number; title: string; relatedPaperIds: string[] }[];
  }>(GET_USER_IDEAS, { skip: !open });

  const [addPaper] = useMutation(ADD_PAPER_TO_IDEA, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });
  const [removePaper] = useMutation(REMOVE_PAPER_FROM_IDEA, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });

  const ideas = ideasData?.userIdeas ?? [];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = useCallback(
    async (ideaId: number, isLinked: boolean) => {
      if (isLinked) {
        await removePaper({ variables: { ideaId, paperId } });
      } else {
        await addPaper({ variables: { ideaId, paperId } });
      }
      refetchIdeas();
    },
    [paperId, addPaper, removePaper, refetchIdeas]
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5"
      >
        <Lightbulb className="h-4 w-4" />
        Add to Idea
        <ChevronDown className="h-3 w-3" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-card shadow-lg py-1">
          {ideas.length === 0 && (
            <div className="px-3 py-3">
              <p className="text-xs text-muted-foreground">No workspace ideas yet.</p>
              <a
                href="/ideas/workspace"
                className="mt-1 inline-block text-xs text-blue-600 hover:underline"
              >
                Create one in workspace
              </a>
            </div>
          )}
          {ideas.map((idea) => {
            const isLinked = idea.relatedPaperIds.includes(paperId);
            return (
              <button
                key={idea.id}
                type="button"
                onClick={() => handleToggle(idea.id, isLinked)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    isLinked
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-border"
                  }`}
                >
                  {isLinked && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate flex-1 text-xs">{idea.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PaperSkeleton({ paperId }: { paperId: string }) {
  return (
    <div className="space-y-8">
      <div>
        <span className="text-xs text-muted-foreground">Paper</span>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{paperId}</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex-1 space-y-6 lg:max-w-[65%]">
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border shadow-none">
              <CardHeader className="p-4">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-5/6" />
                <Skeleton className="mt-2 h-3 w-4/6" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="w-full space-y-6 lg:w-[35%]">
          <Card className="border-border shadow-none">
            <CardHeader className="p-4">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Skeleton className="mx-auto h-64 w-full rounded" />
            </CardContent>
          </Card>
          <Card className="border-border shadow-none">
            <CardHeader className="p-4">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function PaperNotFound({
  paperId,
  backHref,
  backLabel,
}: {
  paperId: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h2 className="text-xl font-semibold text-foreground">
        Paper {paperId} not found
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The paper you are looking for does not exist or has not been ingested
        yet.
      </p>
      <Link
        href={backHref}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface PaperDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PaperDetailPage({ params }: PaperDetailPageProps) {
  const { id } = use(params);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const backHref = returnTo || "/explorer?tab=papers";
  const backLabel = returnTo?.startsWith("/projects/")
    ? "Back to Project"
    : returnTo
      ? "Back"
      : "Back to Explorer";
  const breadcrumbRootLabel = returnTo?.startsWith("/projects/")
    ? "Project"
    : returnTo
      ? "Return"
      : "Explorer";
  const currentPageHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const { data, loading, error } = useQuery<{ paper: Paper }>(GET_PAPER, {
    variables: { id },
  });

  // --- Mutations ---
  const [toggleBookmark] = useMutation(TOGGLE_BOOKMARK);
  const [setReadingStatusMut] = useMutation(SET_READING_STATUS);
  const [saveNoteMutation] = useMutation(SAVE_NOTE);

  // --- Local state for user actions ---
  const [bookmarkOverride, setBookmarkOverride] = useState<{
    paperId: string;
    value: boolean;
  } | null>(null);
  const [statusOverride, setStatusOverride] = useState<{
    paperId: string;
    value: string | null;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{
    paperId: string;
    value: string;
  } | null>(null);
  const [notesOpenOverride, setNotesOpenOverride] = useState<{
    paperId: string;
    value: boolean;
  } | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Score chart toggle ---
  const [showRadar, setShowRadar] = useState(false);

  // --- Generate Ideas modal ---
  const [ideaGenOpen, setIdeaGenOpen] = useState(false);
  const [ideaGenResult, setIdeaGenResult] = useState("");
  const [ideaGenLoading, setIdeaGenLoading] = useState(false);

  // --- Scroll-spy for section TOC ---
  const [activeSection, setActiveSection] = useState<string>("");

  // --- Axis control for "More Like This" ---
  const [activeAxis, setActiveAxis] = useState<string>("all");
  const [axisPapers, setAxisPapers] = useState<RelatedPaper[] | null>(null);
  const [fetchRelatedByAxis, { loading: axisLoading }] = useLazyQuery<{
    paper: { relatedByAxis: RelatedPaper[] };
  }>(GET_RELATED_BY_AXIS);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedIndicatorRef.current) clearTimeout(savedIndicatorRef.current);
    };
  }, []);

  // --- Scroll-spy observer for section TOC ---
  const sections_ = data?.paper?.sections ?? [];
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    const sectionEls = document.querySelectorAll("[id^='section-']");
    sectionEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections_]);

  // --- Handlers ---
  async function handleToggleBookmark() {
    const paperId = data?.paper?.paperId;
    if (!paperId) return;
    const nextValue = !(
      bookmarkOverride?.paperId === paperId
        ? bookmarkOverride.value
        : (data.paper.isBookmarked ?? false)
    );
    setBookmarkOverride({ paperId, value: nextValue });
    try {
      const result = await toggleBookmark({ variables: { paperId } });
      const resultData = result.data as { toggleBookmark: boolean } | undefined;
      if (resultData) {
        setBookmarkOverride({ paperId, value: resultData.toggleBookmark });
      }
    } catch {
      setBookmarkOverride({ paperId, value: !nextValue });
    }
  }

  const handleStatusChange = useCallback(
    async (value: string) => {
      const paperId = data?.paper?.paperId;
      if (!paperId) return;
      const newStatus = value === "not_set" ? null : value;
      if (!newStatus) {
        setStatusOverride({
          paperId,
          value: data?.paper?.readingStatus ?? null,
        });
        return;
      }
      setStatusOverride({ paperId, value: newStatus });
      try {
        await setReadingStatusMut({
          variables: { paperId, status: newStatus },
        });
      } catch {
        setStatusOverride({
          paperId,
          value: data?.paper?.readingStatus ?? null,
        });
      }
    },
    [data?.paper?.paperId, data?.paper?.readingStatus, setReadingStatusMut]
  );

  const handleNoteBlur = useCallback(() => {
    const paperId = data?.paper?.paperId;
    if (!paperId) return;
    const nextNoteText =
      noteDraft?.paperId === paperId
        ? noteDraft.value
        : (data?.paper?.userNote ?? "");

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (nextNoteText.trim()) {
        await saveNoteMutation({
          variables: {
            entityType: "paper",
            entityId: paperId,
            note: nextNoteText.trim(),
          },
        });
      }
      setNoteSaved(true);
      if (savedIndicatorRef.current) clearTimeout(savedIndicatorRef.current);
      savedIndicatorRef.current = setTimeout(() => setNoteSaved(false), 2000);
    }, 300);
  }, [data?.paper?.paperId, data?.paper?.userNote, noteDraft, saveNoteMutation]);

  const handleAxisChange = useCallback(
    async (axis: string) => {
      setActiveAxis(axis);
      if (axis === "all") {
        // Reset to default related papers from the main query
        setAxisPapers(null);
      } else {
        try {
          const { data: axisData } = await fetchRelatedByAxis({
            variables: { id, axis, limit: 10 },
          });
          setAxisPapers(axisData?.paper?.relatedByAxis ?? []);
        } catch {
          setAxisPapers([]);
        }
      }
    },
    [id, fetchRelatedByAxis]
  );

  if (loading) return <PaperSkeleton paperId={id} />;
  if (error || !data?.paper) {
    return <PaperNotFound paperId={id} backHref={backHref} backLabel={backLabel} />;
  }

  const paper = data.paper;
  const getPaperHref = (paperId: string) =>
    buildPaperDetailHref({
      paperId,
      returnTo: currentPageHref,
    });
  const getAtomHref = (atomSlug: string) =>
    buildAtomDetailHref({
      atomSlug,
      returnTo: currentPageHref,
    });
  const getExplorerAtomHref = (atomSlug: string) =>
    buildExplorerAtomHref({
      atomSlug,
      returnTo: currentPageHref,
    });
  const explorerHref = buildExplorerPaperHref({
    query: paper.paperId,
    returnTo: currentPageHref,
  });
  const sections = paper.sections ?? [];
  const scores = paper.scores ?? [];
  const atoms = paper.atoms ?? [];
  const debates = paper.debates ?? [];
  const related = paper.relatedPapers ?? [];
  const similarPapers = paper.similarPapers ?? [];

  const orderedSections = [...sections].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.section);
    const bi = SECTION_ORDER.indexOf(b.section);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Calculate reading time (assume 200 words/min for academic text)
  const totalWords = sections.reduce((sum, s) => sum + (s.content?.split(/\s+/).length || 0), 0);
  const readingMin = Math.max(1, Math.ceil(totalWords / 200));

  const isBookmarked =
    bookmarkOverride?.paperId === paper.paperId
      ? bookmarkOverride.value
      : (paper.isBookmarked ?? false);
  const displayStatus =
    statusOverride?.paperId === paper.paperId
      ? statusOverride.value
      : (paper.readingStatus ?? null);
  const noteText =
    noteDraft?.paperId === paper.paperId
      ? noteDraft.value
      : (paper.userNote ?? "");
  const notesOpen =
    notesOpenOverride?.paperId === paper.paperId
      ? notesOpenOverride.value
      : Boolean(noteText);

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={backHref} className="hover:text-foreground transition-colors">{breadcrumbRootLabel}</Link>
        <span>/</span>
        <Link href={explorerHref} className="hover:text-foreground transition-colors">Papers</Link>
        <span>/</span>
        <span className="font-mono text-foreground">{paper.paperId}</span>
      </nav>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* ============================================================= */}
        {/* MAIN CONTENT (~65%)                                           */}
        {/* ============================================================= */}
        <div className="flex-1 space-y-6 lg:max-w-[65%]">
          {/* --- Header --- */}
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted-foreground">{paper.paperId}</p>
            <div className="flex items-start gap-3">
              <h1 className="text-2xl font-semibold tracking-tight leading-tight text-foreground flex-1">
                {paper.title ?? "Untitled Paper"}
              </h1>
              {paper.nberUrl && (
                <a
                  href={paper.nberUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  View on NBER
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {paper.authors.length > 0 && (
              <p className="text-base text-muted-foreground">
                {paper.authors.map((author, i) => (
                  <span key={author}>
                    <Link
                      href={`/author/${encodeURIComponent(author)}`}
                      className="hover:text-blue-600 hover:underline transition-colors"
                    >
                      {author}
                    </Link>
                    {i < paper.authors.length - 1 && ", "}
                  </span>
                ))}
              </p>
            )}

            {/* Metadata row */}
            <div className="flex flex-wrap gap-2 items-center">
              {paper.year && (
                <span className="text-sm font-medium text-muted-foreground">
                  {paper.year}
                </span>
              )}

              {totalWords > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> ~{readingMin} min read
                </span>
              )}

              {paper.fields.map((f) => (
                <Badge key={f} variant="paper">
                  {f}
                </Badge>
              ))}

              {paper.jel.map((j) => (
                <Badge key={j} variant="outline" className="font-mono text-xs">
                  {j}
                </Badge>
              ))}

              {paper.triageDecision && (
                <Badge variant={triageBadgeVariant(paper.triageDecision)}>
                  {paper.triageDecision.replace(/_/g, " ")}
                </Badge>
              )}

              {(paper.ideaCount ?? 0) > 0 && (
                <Link
                  href={`/ideas?source=${paper.paperId}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  Inspired {paper.ideaCount} research {paper.ideaCount === 1 ? "idea" : "ideas"}
                </Link>
              )}
            </div>

          </div>

          {/* --- Abstract --- */}
          {paper.abstract && (
            <Card className="border-border bg-muted/50 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Abstract
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-sm italic text-muted-foreground leading-relaxed">
                  {paper.abstract}
                </p>
              </CardContent>
            </Card>
          )}

          {/* --- TL;DR --- */}
          {paper.tldr && (
            <div className="rounded-xl border-l-4 border-blue-400 bg-blue-50/50 p-4">
              <p className="text-sm font-semibold text-blue-800 mb-1">TL;DR</p>
              <p className="text-base text-foreground leading-relaxed">{paper.tldr}</p>
            </div>
          )}

          {/* --- Average Score + Action Bar --- */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Average score */}
            {paper.averageScore !== null && (
              <div
                className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 ${scoreBg(paper.averageScore)} ${paper.averageScore >= 4.5 ? "border-green-200" : paper.averageScore >= 3.5 ? "border-blue-200" : "border-border"}`}
              >
                <span
                  className={`text-3xl font-bold tabular-nums ${scoreColor(paper.averageScore)}`}
                >
                  {paper.averageScore.toFixed(1)}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-muted-foreground">
                    Average Score
                  </span>
                  <span className="text-xs text-muted-foreground">out of 5.0</span>
                </div>
              </div>
            )}

            <Button
              variant={isBookmarked ? "default" : "outline"}
              size="sm"
              onClick={handleToggleBookmark}
              className={
                isBookmarked
                  ? "gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                  : "gap-1.5"
              }
            >
              {isBookmarked ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
              {isBookmarked ? "Bookmarked" : "Bookmark"}
            </Button>

            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${statusColor(displayStatus)}`}
              />
              <Select
                value={displayStatus ?? "not_set"}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Reading status" />
                </SelectTrigger>
                <SelectContent>
                  {READING_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${opt.color}`}
                        />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <AddToCollectionDropdown paperId={paper.paperId} />
            <AddToIdeaDropdown paperId={paper.paperId} />

            <Link
              href={buildEntityGraphHref({
                query: paper.paperId,
                source: "paper",
                returnTo: currentPageHref,
                label: paper.title || paper.paperId,
              })}
            >
              <Button variant="outline" size="sm" className="gap-1.5">
                <GitBranch className="h-4 w-4" />
                View Network
              </Button>
            </Link>

            <Link
              href={buildCompareHref({
                paperIds: [paper.paperId],
                source: "paper",
                returnTo: currentPageHref,
                context: paper.title || paper.paperId,
              })}
            >
              <Button variant="outline" size="sm" className="gap-1.5">
                <Scale className="h-4 w-4" />
                Compare
              </Button>
            </Link>

            <button
              onClick={() => setIdeaGenOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Lightbulb className="h-4 w-4" />
              Generate Ideas
            </button>

            <Link
              href={`/ask?paperId=${paper.paperId}`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Ask AI
            </Link>
          </div>

          {/* --- Section Navigation --- */}
          {paper.hasCard && orderedSections.filter((s) => s.content && s.content.trim().length > 0).length > 0 && (
            <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-2 flex gap-2 overflow-x-auto rounded-lg">
              {orderedSections
                .filter((s) => s.content && s.content.trim().length > 0)
                .map((s) => {
                  const sectionId = `section-${s.section.replace(/\s+/g, '-').toLowerCase()}`;
                  return (
                    <button
                      key={s.section}
                      onClick={() => {
                        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        activeSection === sectionId
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {s.section.replace(/_/g, ' ')}
                    </button>
                  );
                })}
            </nav>
          )}

          {/* --- Card Sections --- */}
          {paper.hasCard ? (
            orderedSections.length > 0 ? (
              <div className="space-y-3">
                {orderedSections
                  .filter((s) => s.content && s.content.trim().length > 0)
                  .map((s) => (
                    <div key={s.section} id={`section-${s.section.replace(/\s+/g, '-').toLowerCase()}`}>
                      <SectionCard
                        title={s.section}
                        content={s.content}
                        defaultExpanded={s.section.toLowerCase().includes("research_question")}
                      />
                    </div>
                  ))}
              </div>
            ) : null
          ) : (
            <div className="space-y-4">
              <Card className="border-border bg-muted/50 shadow-none">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Full analysis not yet available. Key information shown below.
                  </p>
                </CardContent>
              </Card>

              {/* Connected Atoms (fallback) */}
              {atoms.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    Connected Atoms
                  </h2>
                  <AtomChips
                    atoms={atoms}
                    getAtomHref={getAtomHref}
                    getExplorerHref={getExplorerAtomHref}
                  />
                </div>
              )}

              {/* Similar Papers (fallback) */}
              {similarPapers.length > 0 && (
                <Card className="border-purple-200 shadow-none">
                  <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-sm font-semibold text-purple-700">
                      Similar Papers
                    </CardTitle>
                    <p className="text-[11px] text-purple-400 mt-0.5">
                      Based on content similarity
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 pt-3">
                    <div className="space-y-3">
                      {similarPapers.slice(0, 5).map((sp) => {
                        const pct = Math.round(sp.similarityScore * 100);
                        return (
                          <Link
                            key={sp.paperId}
                            href={getPaperHref(sp.paperId)}
                            className="block rounded-md border border-purple-100 p-3 transition-colors hover:bg-purple-50/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {sp.paperId}
                              </span>
                              <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                                {pct}% match
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {sp.title ?? "Untitled"}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Related Papers (fallback) */}
              {related.length > 0 && (
                <Card className="border-border shadow-none">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground">
                      Related Papers
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Shared knowledge atoms
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="space-y-3">
                      {related.slice(0, 5).map((rp) => (
                        <Link
                          key={rp.paperId}
                          href={getPaperHref(rp.paperId)}
                          className="block rounded-md border border-border p-3 transition-colors hover:bg-muted"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {rp.paperId}
                            </span>
                            {rp.sharedAtomCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                {rp.sharedAtomCount} shared
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {rp.title ?? "Untitled"}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* --- Active Debates --- */}
          {debates.length > 0 && (
            <Card className="border-orange-200 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                  <Swords className="h-4 w-4" />
                  Active Debates
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                {debates.map((debate: PaperDebate, idx: number) => (
                  <div
                    key={`${debate.title}-${idx}`}
                    className={`space-y-2 ${idx > 0 ? "border-t border-orange-100 pt-4" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {debate.title}
                      </h3>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          debate.paperStance === "supporting"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : debate.paperStance === "challenging"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-blue-100 text-blue-700 border-blue-200"
                        }`}
                      >
                        {debate.paperStance === "supporting"
                          ? "Supporting"
                          : debate.paperStance === "challenging"
                          ? "Challenging"
                          : "Discussed"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {debate.context}
                    </p>
                    {debate.otherPapers.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="text-[10px] text-muted-foreground mr-1 self-center">
                          Also in this debate:
                        </span>
                        {debate.otherPapers.map((pid) => (
                          <Link
                            key={pid}
                            href={getPaperHref(pid)}
                            className="inline-flex items-center rounded bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-[10px] font-mono text-orange-700 hover:bg-orange-100 transition-colors"
                          >
                            {pid}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* --- Connected Atoms --- */}
          {atoms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Connected Atoms
              </h2>
              <AtomChips
                atoms={atoms}
                getAtomHref={getAtomHref}
                getExplorerHref={getExplorerAtomHref}
              />
            </div>
          )}

          {/* --- My Notes --- */}
          <Card className="border-border shadow-none">
            <CardHeader
              className="p-4 cursor-pointer select-none"
              onClick={() =>
                setNotesOpenOverride({
                  paperId: paper.paperId,
                  value: !notesOpen,
                })
              }
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  My Notes
                </CardTitle>
                <div className="flex items-center gap-2">
                  {noteSaved && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {notesOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>
            {notesOpen && (
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 resize-y"
                  placeholder="Add your notes about this paper..."
                  value={noteText}
                  onChange={(e) =>
                    setNoteDraft({
                      paperId: paper.paperId,
                      value: e.target.value,
                    })
                  }
                  onBlur={handleNoteBlur}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Notes auto-save when you click away. Use [[w31184]] to link to other papers, [[atom_slug]] to link to atoms.
                </p>
                {/* Rendered note preview with linked references */}
                {noteText.includes("[[") && (
                  <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2">
                    <p className="text-[10px] font-medium text-blue-500 mb-1">Preview</p>
                    <div className="text-sm text-muted-foreground">
                      <NoteRenderer content={noteText} />
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* --- Backlinks --- */}
          {paper.backlinkNotes && paper.backlinkNotes.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/30 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-blue-700">
                  Backlinks
                  <span className="ml-1.5 text-xs font-normal text-blue-400">
                    Referenced by {paper.backlinkNotes.length} note{paper.backlinkNotes.length !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="space-y-2">
                  {paper.backlinkNotes.map((bl: BacklinkNote) => {
                    const blHref =
                      bl.entityType === "paper"
                        ? getPaperHref(bl.entityId)
                        : bl.entityType === "atom"
                        ? getAtomHref(bl.entityId)
                        : "#";
                    return (
                      <Link
                        key={`${bl.entityType}-${bl.entityId}`}
                        href={blHref}
                        className="flex items-start gap-2 rounded-md border border-blue-100 bg-card p-2.5 hover:bg-blue-50 transition-colors"
                      >
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5">
                          {bl.entityType}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-blue-600">
                            {bl.entityId}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {bl.notePreview}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ============================================================= */}
        {/* SIDEBAR (~35%)                                                */}
        {/* ============================================================= */}
        <div className="w-full space-y-6 lg:w-[35%] lg:sticky lg:top-6 lg:self-start">
          {/* --- Score Profile (toggle between Bars and Radar) --- */}
          {scores.length > 0 && (
            <Card className="border-border shadow-none">
              <CardHeader className="p-4 pb-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Score Profile</h3>
                  <button
                    onClick={() => setShowRadar(!showRadar)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showRadar ? "Show Bars" : "Show Radar"}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {showRadar ? <ScoreRadar scores={scores} /> : <ScoreBars scores={scores} />}
              </CardContent>
            </Card>
          )}

          {/* --- Related Papers with Axis Control --- */}
          {related.length > 0 && (
            <Card className="border-border shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  More Like This
                </CardTitle>
                {/* Axis control buttons */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {[
                    { key: "all", label: "All" },
                    { key: "method", label: "Same Method" },
                    { key: "dataset", label: "Same Data" },
                    { key: "mechanism", label: "Same Mechanism" },
                    { key: "topic", label: "Similar Topic" },
                  ].map((btn) => (
                    <button
                      key={btn.key}
                      onClick={() => handleAxisChange(btn.key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        activeAxis === btn.key
                          ? "bg-blue-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {axisLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const displayPapers = axisPapers ?? related;
                      const isTopic = activeAxis === "topic";
                      if (displayPapers.length === 0) {
                        return (
                          <p className="py-4 text-center text-xs text-muted-foreground">
                            No related papers found for this axis.
                          </p>
                        );
                      }
                      return (
                        <TooltipProvider delayDuration={200}>
                          <div className="space-y-3">
                            {displayPapers.map((rp) => (
                              <Link
                                key={rp.paperId}
                                href={getPaperHref(rp.paperId)}
                                className="block rounded-md border border-border p-3 transition-colors hover:bg-muted"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {rp.paperId}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isTopic && rp.similarityScore != null ? (
                                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                                        {Math.round(rp.similarityScore * 100)}% match
                                      </span>
                                    ) : rp.sharedAtomCount > 0 ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 cursor-help">
                                            {rp.sharedAtomCount} shared
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="max-w-56">
                                          <p className="text-xs font-medium mb-1">
                                            Shared atoms:
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {rp.sharedAtoms.map((slug) => (
                                              <span
                                                key={slug}
                                                className="inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800"
                                              >
                                                {slug.replace(/_/g, " ")}
                                              </span>
                                            ))}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : null}
                                    {rp.averageScore !== null && (
                                      <span
                                        className={`text-xs font-semibold ${scoreColor(rp.averageScore)}`}
                                      >
                                        {rp.averageScore.toFixed(1)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                  {rp.title ?? "Untitled"}
                                </p>
                                {rp.year && (
                                  <span className="mt-1 text-xs text-muted-foreground">
                                    {rp.year}
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        </TooltipProvider>
                      );
                    })()}
                  </>
                )}

                <Link
                  href={explorerHref}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  View in Explorer
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Floating paper chat */}
      <PaperChat
        paperId={paper.paperId}
        paperTitle={paper.title ?? "Untitled Paper"}
      />

      {/* Generate Ideas modal */}
      {ideaGenOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg bg-card border border-border p-6 shadow-lg">
            <button
              onClick={() => { setIdeaGenOpen(false); setIdeaGenResult(""); }}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Research Ideas from {paper.title}
            </h2>

            {!ideaGenResult && !ideaGenLoading && (
              <button
                onClick={async () => {
                  setIdeaGenLoading(true);
                  setIdeaGenResult("");
                  try {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";
                    const res = await fetch(`${apiUrl}/api/generate-ideas`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ paper_ids: [paper.paperId], num_ideas: 3 }),
                    });
                    const reader = res.body?.getReader();
                    const decoder = new TextDecoder();
                    if (reader) {
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const text = decoder.decode(value);
                        for (const line of text.split("\n")) {
                          if (line.startsWith("data: ")) {
                            try {
                              const data = JSON.parse(line.slice(6));
                              if (data.type === "chunk") setIdeaGenResult(prev => prev + data.text);
                            } catch {}
                          }
                        }
                      }
                    }
                  } catch (e) {
                    setIdeaGenResult("Failed to generate ideas. Please try again.");
                  }
                  setIdeaGenLoading(false);
                }}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 font-medium hover:bg-primary/90"
              >
                Generate 3 Research Ideas
              </button>
            )}

            {ideaGenLoading && !ideaGenResult && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating ideas...
              </div>
            )}

            {ideaGenResult && (
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                {ideaGenResult}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
