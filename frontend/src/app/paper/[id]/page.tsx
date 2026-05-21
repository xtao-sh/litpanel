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
  Lightbulb,
  Loader2,
  FolderPlus,
  MessageCircle,
  Plus,
  RefreshCw,
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
import { appConfig } from "@/lib/app-config";
import { activeLibraryFetch, getApiUrl, readErrorMessage, withActiveLibraryHeaders } from "@/lib/api";
import {
  buildAtomDetailHref,
  buildCompareHref,
  buildExplorerAtomHref,
  buildExplorerPaperHref,
  buildPaperDetailHref,
  buildPaperGraphHref,
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
  if (score === null) return "text-[var(--ink-5)]";
  if (score >= 4.5) return "text-[var(--forest)]";
  if (score >= 3.5) return "text-[#2c4870]";
  return "text-[var(--ink-4)]";
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
  { value: "not_set", label: "未读", color: "bg-[var(--line)]" },
  { value: "to_read", label: "待读", color: "bg-[#b88a3b]" },
  { value: "reading", label: "阅读中", color: "bg-[#6f86a6]" },
  { value: "skimmed", label: "已略读", color: "bg-[#6f86a6]" },
  { value: "read_in_detail", label: "已精读", color: "bg-[var(--forest)]" },
];

interface PaperProcessingDimension {
  dimension_key: string;
  label: string;
  status: string;
  quality_score: number | null;
}

interface PaperProcessingState {
  library_id: number;
  paper_id: string;
  processing_status: string;
  reading_profile: string;
  analysis_focuses: string[];
  reading_status: string | null;
  imported_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  last_error: string;
  extraction_status: Record<string, boolean>;
  extraction_rows: PaperProcessingDimension[];
}

interface PaperFeedbackItem {
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

function processingBadgeTone(status: string): string {
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

function formatProcessingText(value: string | null | undefined): string {
  if (!value) return "未设置";
  const labels: Record<string, string> = {
    completed: "已完成",
    triaged: "已初筛",
    indexed: "已索引",
    pending: "等待中",
    error: "出错",
    pdf_error: "PDF 出错",
    timeout: "超时",
    auto: "自动",
    metadata_only: "仅元数据",
    title_abstract: "标题与摘要",
    full_content: "全文读取",
    style_logic: "写法与逻辑",
    accept: "保留",
    deep_read: "精读",
    reject: "忽略",
    include: "已纳入",
    included: "已纳入",
    not_set: "未读",
    to_read: "待读",
    reading: "阅读中",
    skimmed: "已略读",
    read_in_detail: "已精读",
    complete: "完成",
    missing: "缺失",
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function formatSectionLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, "_");
  const labels: Record<string, string> = {
    research_question: "研究问题",
    identification_and_method: "识别与方法",
    key_findings: "关键发现",
    what_makes_this_paper_good: "论文价值",
    limitations_and_open_questions: "局限与开放问题",
    china_applicability: "中国适用性",
  };
  return labels[value] ?? labels[normalized] ?? value.replace(/_/g, " ");
}

function sectionDomId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `section-${slug || "card"}`;
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

const REPROCESS_PROFILE_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "metadata_only", label: "仅元数据" },
  { value: "title_abstract", label: "标题与摘要" },
  { value: "full_content", label: "全文读取" },
  { value: "style_logic", label: "写法与逻辑" },
];

const FEEDBACK_TYPE_OPTIONS = [
  { value: "good", label: "可用" },
  { value: "too_shallow", label: "太浅" },
  { value: "incorrect", label: "不准确" },
  { value: "missing", label: "缺失" },
  { value: "format_issue", label: "格式问题" },
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
        className="gap-1.5 rounded-full"
      >
        <FolderPlus className="h-4 w-4" />
        集合
        <ChevronDown className="h-3 w-3" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--shadow-2)] py-1">
          {collections.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-[var(--ink-4)]">还没有集合。</p>
          )}
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => handleToggle(col.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--paper-2)] transition-colors"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  paperCollectionIds.has(col.id)
                    ? "border-[#2c4870] bg-[#2c4870] text-[var(--paper)]"
                    : "border-[var(--line-soft)]"
                }`}
              >
                {paperCollectionIds.has(col.id) && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate flex-1">{col.name}</span>
              <span className="text-[10px] text-[var(--ink-4)] shrink-0">{col.paperCount}</span>
            </button>
          ))}

          <div className="border-t border-[var(--line-soft)] mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="集合名称"
                  className="w-full rounded border border-[var(--line-soft)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
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
                    className="rounded bg-[#2c4870] px-2 py-0.5 text-[10px] font-medium text-[var(--paper)] hover:bg-[#2c4870] disabled:opacity-40"
                  >
                    创建
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); }}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-[var(--ink-4)] hover:bg-[var(--paper-2)]"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#2c4870] hover:bg-[#e9eef6] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                新建集合
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
        className="gap-1.5 rounded-full"
      >
        <Lightbulb className="h-4 w-4" />
        加入想法
        <ChevronDown className="h-3 w-3" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--shadow-2)] py-1">
          {ideas.length === 0 && (
            <div className="px-3 py-3">
              <p className="text-xs text-[var(--ink-4)]">还没有研究想法。</p>
              <a
                href="/ideas/workspace"
                className="mt-1 inline-block text-xs text-[#2c4870] hover:underline"
              >
                去想法页创建
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
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--paper-2)] transition-colors"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    isLinked
                      ? "border-[#2c4870] bg-[#2c4870] text-[var(--paper)]"
                      : "border-[var(--line-soft)]"
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
    <div className="paper-detail-page space-y-8">
      <div>
        <span className="section-kicker">Paper</span>
        <p className="mt-1 font-mono text-sm text-[var(--ink-4)]">{paperId}</p>
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
            <Card key={i} className="lp-card rounded-[var(--r-md)] shadow-none">
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
          <Card className="lp-card rounded-[var(--r-md)] shadow-none">
            <CardHeader className="p-4">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Skeleton className="mx-auto h-64 w-full rounded" />
            </CardContent>
          </Card>
          <Card className="lp-card rounded-[var(--r-md)] shadow-none">
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
      <h2 className="font-display text-[2.1rem] text-[var(--ink)]">
        没有找到论文 {paperId}
      </h2>
      <p className="mt-2 text-sm text-[var(--ink-4)]">
        这篇论文不存在，或还没有导入当前文献库。
      </p>
      <Link
        href={backHref}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--forest)] hover:text-[var(--forest)]/90"
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
    ? "返回项目"
    : returnTo
      ? "返回"
      : "返回文献浏览器";
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
  const [processingState, setProcessingState] = useState<PaperProcessingState | null>(null);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const [reprocessProfile, setReprocessProfile] = useState("auto");
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [reprocessMessage, setReprocessMessage] = useState("");
  const [feedbackItems, setFeedbackItems] = useState<PaperFeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackType, setFeedbackType] = useState("too_shallow");
  const [feedbackDimension, setFeedbackDimension] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("3");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProcessingState() {
      setProcessingLoading(true);
      setProcessingError("");
      try {
        const response = await activeLibraryFetch(
          `${getApiUrl()}/api/papers/${encodeURIComponent(id)}/processing`
        );
        if (response.status === 404) {
          if (!active) return;
          setProcessingState(null);
          setProcessingError("");
          return;
        }
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Failed to load processing state"));
        }
        const payload = (await response.json()) as PaperProcessingState;
        if (!active) return;
        setProcessingState(payload);
        setReprocessProfile(payload.reading_profile || "auto");
      } catch (error_) {
        if (!active) return;
        setProcessingState(null);
        const message =
          error_ instanceof Error ? error_.message : "Failed to load processing state.";
        setProcessingError(message.toLowerCase().includes("paper not found") ? "" : message);
      } finally {
        if (active) setProcessingLoading(false);
      }
    }

    loadProcessingState();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const firstDimension = processingState?.extraction_rows?.[0]?.dimension_key ?? "";
    if (!firstDimension) {
      setFeedbackDimension("");
      return;
    }
    setFeedbackDimension((current) => current || firstDimension);
  }, [processingState?.extraction_rows]);

  useEffect(() => {
    let active = true;

    async function loadFeedback() {
      setFeedbackLoading(true);
      setFeedbackError("");
      try {
        const response = await activeLibraryFetch(
          `${getApiUrl()}/api/papers/${encodeURIComponent(id)}/feedback`
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Failed to load feedback"));
        }
        const payload = await response.json();
        if (!active) return;
        setFeedbackItems((payload.items ?? []) as PaperFeedbackItem[]);
      } catch (error_) {
        if (!active) return;
        setFeedbackItems([]);
        setFeedbackError(error_ instanceof Error ? error_.message : "Failed to load feedback.");
      } finally {
        if (active) setFeedbackLoading(false);
      }
    }

    loadFeedback();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedIndicatorRef.current) clearTimeout(savedIndicatorRef.current);
    };
  }, []);

  // --- Scroll-spy observer for section TOC ---
  const sections_ = useMemo(() => data?.paper?.sections ?? [], [data?.paper?.sections]);
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

  const reloadProcessingState = useCallback(async () => {
    const response = await activeLibraryFetch(
      `${getApiUrl()}/api/papers/${encodeURIComponent(id)}/processing`
    );
    if (response.status === 404) {
      setProcessingState(null);
      setProcessingError("");
      return;
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to load processing state"));
    }
    const payload = (await response.json()) as PaperProcessingState;
    setProcessingState(payload);
    setReprocessProfile(payload.reading_profile || "auto");
  }, [id]);

  const reloadFeedback = useCallback(async () => {
    const response = await activeLibraryFetch(
      `${getApiUrl()}/api/papers/${encodeURIComponent(id)}/feedback`
    );
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to load feedback"));
    }
    const payload = await response.json();
    setFeedbackItems((payload.items ?? []) as PaperFeedbackItem[]);
  }, [id]);

  const handleReprocess = useCallback(async () => {
    setReprocessLoading(true);
    setReprocessMessage("");
    try {
      const response = await activeLibraryFetch(
        `${getApiUrl()}/api/papers/${encodeURIComponent(id)}/reprocess`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reading_profile: reprocessProfile,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to re-run extraction"));
      }
      await response.json();
      await reloadProcessingState();
      setReprocessMessage("Re-run completed.");
    } catch (error_) {
      setReprocessMessage(
        error_ instanceof Error ? error_.message : "Failed to re-run extraction."
      );
    } finally {
      setReprocessLoading(false);
    }
  }, [id, reprocessProfile, reloadProcessingState]);

  const handleSubmitFeedback = useCallback(async () => {
    setFeedbackSubmitting(true);
    setFeedbackError("");
    try {
      const response = await activeLibraryFetch(
        `${getApiUrl()}/api/papers/${encodeURIComponent(id)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dimension_key: feedbackDimension,
            feedback_type: feedbackType,
            rating: Number(feedbackRating),
            comment: feedbackComment,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to save feedback"));
      }
      setFeedbackComment("");
      await reloadFeedback();
    } catch (error_) {
      setFeedbackError(error_ instanceof Error ? error_.message : "Failed to save feedback.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [feedbackComment, feedbackDimension, feedbackRating, feedbackType, id, reloadFeedback]);

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
  const visibleSections = orderedSections.filter(
    (section) => section.content && section.content.trim().length > 0
  );
  const sectionLinks = visibleSections.map((section) => ({
    key: section.section,
    id: sectionDomId(section.section),
    label: formatSectionLabel(section.section),
  }));

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
  const displayStatusOption =
    READING_STATUS_OPTIONS.find((option) => option.value === (displayStatus ?? "not_set")) ??
    READING_STATUS_OPTIONS[0];
  const noteText =
    noteDraft?.paperId === paper.paperId
      ? noteDraft.value
      : (paper.userNote ?? "");
  const notesOpen =
    notesOpenOverride?.paperId === paper.paperId
      ? notesOpenOverride.value
      : Boolean(noteText);
  const averageScore =
    scores.length > 0
      ? scores.reduce((sum, score) => sum + score.score, 0) / scores.length
      : null;
  const completedDimensions =
    processingState?.extraction_rows.filter((row) => row.status === "complete").length ??
    visibleSections.length;
  const statItems = [
    {
      label: "Year",
      value: paper.year ? String(paper.year) : "—",
      sub: totalWords > 0 ? `约 ${readingMin} 分钟` : "阅读时间未估算",
    },
    {
      label: "Dimensions",
      value: String(completedDimensions),
      sub: "结构化读取",
    },
    {
      label: "Atoms",
      value: String(atoms.length),
      sub: "关联知识点",
    },
    {
      label: "Fields",
      value: String(paper.fields.length),
      sub: paper.fields[0] ?? "未标注领域",
    },
    {
      label: "Score",
      value: averageScore == null ? "—" : averageScore.toFixed(1),
      sub: averageScore == null ? "暂无评分" : "综合评分",
    },
  ];

  return (
    <div className="paper-detail-page space-y-8">
      <div className="paper-grid">
        {/* ============================================================= */}
        {/* MAIN CONTENT (~65%) */}
        {/* ============================================================= */}
        <div className="min-w-0 space-y-7">
          {/* --- Header --- */}
          <header className="paper-head space-y-4">
            <div className="paper-eyebrow">
              <p className="paper-id">论文档案 · <b>{paper.paperId}</b></p>
            </div>
            <div className="flex items-start gap-3">
              <h1 className="paper-title flex-1">
                {paper.title ?? "未命名论文"}
              </h1>
              {paper.nberUrl && (
                <a
                  href={paper.nberUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 mt-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                >
                  {appConfig.externalPaperLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {paper.authors.length > 0 && (
              <p className="paper-byline">
                {paper.authors.map((author, i) => (
                  <span key={author}>
                    <Link
                      href={`/author/${encodeURIComponent(author)}`}
                      className="auth transition-colors hover:text-[var(--forest)] hover:underline"
                    >
                      {author}
                    </Link>
                    {i < paper.authors.length - 1 && <span className="amp">,</span>}
                  </span>
                ))}
              </p>
            )}

            <div className="lit-stat-strip">
              {statItems.map((item) => (
                <div key={item.label} className="lit-stat-cell">
                  <div className="lit-stat-label">{item.label}</div>
                  <div className="lit-stat-value">{item.value}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--ink-4)]">
                    {item.sub}
                  </div>
                </div>
              ))}
            </div>

            <div className="paper-meta-stack">
              {paper.triageDecision ? (
                <div className="paper-meta-line">
                  <span className="paper-meta-label">筛选</span>
                  <Badge variant={triageBadgeVariant(paper.triageDecision)}>
                    {formatProcessingText(paper.triageDecision)}
                  </Badge>
                </div>
              ) : null}

              {paper.fields.length > 0 ? (
                <div className="paper-meta-line">
                  <span className="paper-meta-label">
                    领域
                  </span>
                  {paper.fields.map((f) => (
                    <Link
                      key={f}
                      href={buildExplorerPaperHref({
                        query: "",
                        filters: { fields: [f] },
                        returnTo: currentPageHref,
                      })}
                      title={`查看 ${f} 领域的文献`}
                      className="lit-tag transition-colors hover:border-[var(--forest)] hover:text-[var(--forest)]"
                    >
                      {f}
                    </Link>
                  ))}
                </div>
              ) : null}

              {(paper.jel.length > 0 || (paper.ideaCount ?? 0) > 0) ? (
                <div className="paper-meta-line">
                  {paper.jel.length > 0 ? (
                    <>
                      <span className="paper-meta-label">
                        JEL
                      </span>
                      {paper.jel.map((j) => (
                        <Link
                          key={j}
                          href={buildExplorerPaperHref({
                            query: j,
                            returnTo: currentPageHref,
                          })}
                          title={`查看 JEL ${j} 相关文献`}
                          className="lit-tag font-mono transition-colors hover:border-[var(--forest)] hover:text-[var(--forest)]"
                        >
                          {j}
                        </Link>
                      ))}
                    </>
                  ) : null}
                  {(paper.ideaCount ?? 0) > 0 ? (
                    <Link
                      href={`/ideas?source=${paper.paperId}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#d6b678] bg-[#f4ead8] px-3 py-1 text-xs font-medium text-[#7a5a18] transition-colors hover:bg-[#f4ead8]"
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                      相关想法 {paper.ideaCount}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

          </header>

          {/* --- Abstract --- */}
          {paper.abstract && (
            <Card className="border-[var(--line-soft)] bg-transparent shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="section-kicker text-[var(--ink-4)]">
                  摘要
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="font-display text-[1.04rem] italic leading-relaxed text-[var(--ink-4)]">
                  {paper.abstract}
                </p>
              </CardContent>
            </Card>
          )}

          {/* --- TL;DR --- */}
          {paper.tldr && (
            <div className="lp-card rounded-[0.7rem] p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-4)]">
                一句话摘要
              </p>
              <p className="text-base text-[var(--ink)] leading-relaxed">{paper.tldr}</p>
            </div>
          )}

          {/* --- Paper Actions --- */}
          <div className="lp-card grid gap-3 rounded-[0.7rem] px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                管理
              </span>
              <Button
                variant={isBookmarked ? "default" : "outline"}
                size="sm"
                onClick={handleToggleBookmark}
                className={
                  isBookmarked
                    ? "gap-1.5 rounded-full bg-[#b88a3b] hover:bg-[#8a6d3b] text-[var(--paper)] border-[#8a6d3b]"
                    : "gap-1.5 rounded-full"
                }
              >
                {isBookmarked ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
                {isBookmarked ? "已收藏" : "收藏"}
              </Button>

              <div className="inline-flex h-9 items-center rounded-full border border-[var(--line-soft)]/80 bg-[var(--paper)] px-2">
                <Select value={displayStatus ?? "not_set"} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-7 w-auto min-w-[72px] border-0 bg-transparent px-1 py-0 text-sm font-medium shadow-none focus:ring-0">
                    <SelectValue placeholder={displayStatusOption.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {READING_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${opt.color}`} />
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AddToCollectionDropdown paperId={paper.paperId} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                操作
              </span>
              <AddToIdeaDropdown paperId={paper.paperId} />

              <Link
                href={buildPaperGraphHref({
                  paperId: paper.paperId,
                  source: "paper",
                  returnTo: currentPageHref,
                  label: paper.title || paper.paperId,
                })}
              >
                <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                  <GitBranch className="h-4 w-4" />
                  查看图谱
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
                <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                  <Scale className="h-4 w-4" />
                  对比
                </Button>
              </Link>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIdeaGenOpen(true)}
                className="gap-1.5 rounded-full"
              >
                <Lightbulb className="h-4 w-4" />
                生成想法
              </Button>
            </div>
          </div>

          {/* --- Section Navigation --- */}
          {paper.hasCard && sectionLinks.length > 0 && (
            <nav className="lit-section-nav sticky top-16 z-10 flex items-center gap-2 overflow-x-auto px-3 py-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                读取维度
              </span>
              {sectionLinks.map((section) => (
                <Link
                  key={section.key}
                  href={`#${section.id}`}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    activeSection === section.id
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                  )}
                >
                  {section.label}
                </Link>
              ))}
            </nav>
          )}

          {/* --- Card Sections --- */}
          {paper.hasCard ? (
            orderedSections.length > 0 ? (
              <div className="space-y-0">
                {visibleSections
                  .map((s) => (
                    <div key={s.section} id={sectionDomId(s.section)} className="scroll-mt-24">
                      <SectionCard
                        title={s.section}
                        content={s.content}
                        defaultExpanded={s.section.toLowerCase().replace(/\s+/g, "_").includes("research_question")}
                      />
                    </div>
                  ))}
              </div>
            ) : null
          ) : (
            <div className="space-y-4">
              <Card className="border-[var(--line-soft)] bg-[var(--paper-2)]/50 shadow-none">
                <CardContent className="p-4">
                  <p className="text-sm text-[var(--ink-4)]">
                    这篇论文还没有完整的 AI 读取结果，下方先显示已有信息。
                  </p>
                </CardContent>
              </Card>

              {/* Connected Atoms (fallback) */}
              {atoms.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-[var(--ink)]">
                    关联知识点
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
                <Card className="border-[#bccbe0] shadow-none">
                  <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-sm font-semibold text-[#223a5e]">
                      相似论文
                    </CardTitle>
                    <p className="text-[11px] text-[#4e688d] mt-0.5">
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
                            className="block rounded-[var(--r)] border border-[#dfe7f2] p-3 transition-colors hover:bg-[#e9eef6]/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs text-[var(--ink-4)]">
                                {sp.paperId}
                              </span>
                              <span className="shrink-0 rounded-full bg-[#e9eef6] px-1.5 py-0.5 text-[10px] font-semibold text-[#223a5e]">
                                {pct}% match
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-4)]">
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
                <Card className="border-[var(--line-soft)] shadow-none">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold text-[var(--ink-4)]">
                      Related Papers
                    </CardTitle>
                    <p className="text-[11px] text-[var(--ink-4)] mt-0.5">
                      Shared knowledge atoms
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="space-y-3">
                      {related.slice(0, 5).map((rp) => (
                        <Link
                          key={rp.paperId}
                          href={getPaperHref(rp.paperId)}
                          className="block rounded-[var(--r)] border border-[var(--line-soft)] p-3 transition-colors hover:bg-[var(--paper-2)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs text-[var(--ink-4)]">
                              {rp.paperId}
                            </span>
                            {rp.sharedAtomCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e9eef6] px-1.5 py-0.5 text-[10px] font-semibold text-[#223a5e]">
                                共同知识点 {rp.sharedAtomCount}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-4)]">
                            {rp.title ?? "未命名论文"}
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
            <Card className="border-[#d6b678] shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#7a5a18]">
                  <Swords className="h-4 w-4" />
                  活跃争议
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                {debates.map((debate: PaperDebate, idx: number) => (
                  <div
                    key={`${debate.title}-${idx}`}
                    className={`space-y-2 ${idx > 0 ? "border-t border-[#f4ead8] pt-4" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--ink)]">
                        {debate.title}
                      </h3>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          debate.paperStance === "supporting"
                            ? "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]"
                            : debate.paperStance === "challenging"
                            ? "bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]"
                            : "bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]"
                        }`}
                      >
                        {debate.paperStance === "supporting"
                          ? "支持"
                          : debate.paperStance === "challenging"
                          ? "挑战"
                          : "讨论"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ink-4)] leading-relaxed">
                      {debate.context}
                    </p>
                    {debate.otherPapers.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="text-[10px] text-[var(--ink-4)] mr-1 self-center">
                          Also in this debate:
                        </span>
                        {debate.otherPapers.map((pid) => (
                          <Link
                            key={pid}
                            href={getPaperHref(pid)}
                            className="inline-flex items-center rounded bg-[#f4ead8] border border-[#d6b678] px-1.5 py-0.5 text-[10px] font-mono text-[#7a5a18] hover:bg-[#f4ead8] transition-colors"
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
              <h2 className="text-lg font-semibold text-[var(--ink)]">
                关联知识点
              </h2>
              <AtomChips
                atoms={atoms}
                getAtomHref={getAtomHref}
                getExplorerHref={getExplorerAtomHref}
              />
            </div>
          )}

          {/* --- My Notes --- */}
          <Card className="border-[var(--line-soft)] shadow-none">
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
                <CardTitle className="text-sm font-semibold text-[var(--ink-4)]">
                  My Notes
                </CardTitle>
                <div className="flex items-center gap-2">
                  {noteSaved && (
                    <span className="flex items-center gap-1 text-xs text-[var(--forest)]">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {notesOpen ? (
                    <ChevronUp className="h-4 w-4 text-[var(--ink-4)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
                  )}
                </div>
              </div>
            </CardHeader>
            {notesOpen && (
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                <textarea
                  className="w-full min-h-[120px] rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)] focus:ring-offset-1 resize-y"
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
                <p className="mt-1.5 text-xs text-[var(--ink-4)]">
                  Notes auto-save when you click away. Use [[w31184]] to link to other papers, [[atom_slug]] to link to atoms.
                </p>
                {/* Rendered note preview with linked references */}
                {noteText.includes("[[") && (
                  <div className="rounded-[var(--r)] border border-[#dfe7f2] bg-[#e9eef6]/50 px-3 py-2">
                    <p className="mb-1 text-[10px] font-medium text-[#2c4870]">预览</p>
                    <div className="text-sm text-[var(--ink-4)]">
                      <NoteRenderer content={noteText} />
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* --- Backlinks --- */}
          {paper.backlinkNotes && paper.backlinkNotes.length > 0 && (
            <Card className="border-[#bccbe0] bg-[#e9eef6]/30 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-[#223a5e]">
                  反向引用
                  <span className="ml-1.5 text-xs font-normal text-[#4e688d]">
                    {paper.backlinkNotes.length} 条笔记引用
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
                        className="flex items-start gap-2 rounded-[var(--r)] border border-[#dfe7f2] bg-[var(--paper)] p-2.5 hover:bg-[#e9eef6] transition-colors"
                      >
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5">
                          {bl.entityType}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-[#2c4870]">
                            {bl.entityId}
                          </span>
                          <p className="text-xs text-[var(--ink-4)] mt-0.5 line-clamp-2">
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
        {/* SIDEBAR (~35%) */}
        {/* ============================================================= */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="border-[var(--line-soft)] shadow-none">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold text-[var(--ink)]">
                AI 读取状态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              {processingLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-4)]" />
                </div>
              ) : processingError ? (
                <p className="text-xs leading-5 text-[var(--rust)]">{processingError}</p>
              ) : processingState ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${processingBadgeTone(processingState.processing_status)}`}
                    >
                      {formatProcessingText(processingState.processing_status)}
                    </span>
                    <span className="text-[11px] text-[var(--ink-4)]">
                      方案: {formatProcessingText(processingState.reading_profile)}
                    </span>
                  </div>

                  <div className="space-y-2 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ink-4)]">导入时间</span>
                      <span className="text-[var(--ink)]">
                        {processingState.imported_at
                          ? new Date(processingState.imported_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ink-4)]">更新时间</span>
                      <span className="text-[var(--ink)]">
                        {processingState.updated_at
                          ? new Date(processingState.updated_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ink-4)]">阅读状态</span>
                      <span className="text-[var(--ink)]">
                        {formatProcessingText(processingState.reading_status)}
                      </span>
                    </div>
                  </div>

                  {processingState.analysis_focuses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                        读取重点
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {processingState.analysis_focuses.map((focus) => (
                          <Badge key={focus} variant="outline" className="text-[10px]">
                            {formatProcessingText(focus)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                      覆盖情况
                    </p>
                    <div className="space-y-2">
                      {processingState.extraction_rows.map((row) => (
                        <div
                          key={row.dimension_key}
                          className="flex items-center justify-between rounded-[var(--r)] border border-[var(--line-soft)] px-3 py-2 text-xs"
                        >
                          <span className="text-[var(--ink)]">{row.label}</span>
                          <div className="flex items-center gap-2">
                            {typeof row.quality_score === "number" ? (
                              <span className="text-[11px] text-[var(--ink-4)]">
                                {row.quality_score.toFixed(1)}/5
                              </span>
                            ) : null}
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                                row.status === "complete"
                                  ? "bg-[#e9eef6] text-[#223a5e]"
                                  : "bg-[var(--paper-2)] text-[var(--ink-4)]"
                              }`}
                            >
                              {row.status === "complete" ? "完成" : "缺失"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                          重新读取
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-4)]">
                          选择重新读取的深度，刷新这篇论文的结构化信息。
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Select
                        value={reprocessProfile}
                        onValueChange={setReprocessProfile}
                        disabled={reprocessLoading}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="选择读取方案" />
                        </SelectTrigger>
                        <SelectContent>
                          {REPROCESS_PROFILE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={handleReprocess}
                        disabled={reprocessLoading}
                      >
                        {reprocessLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {reprocessLoading ? "正在读取..." : "重新读取"}
                      </Button>
                      {reprocessMessage ? (
                        <p
                          className={cn(
                            "text-xs leading-5",
                            reprocessMessage === "Re-run completed."
                              ? "text-[var(--forest-2)]"
                              : "text-[#8a3318]"
                          )}
                        >
                          {reprocessMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-3">
                    <button
                      type="button"
                      onClick={() => setFeedbackOpen((value) => !value)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                          读取反馈
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-4)]">
                          标记不准确或缺失的维度。
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {feedbackItems.length > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {feedbackItems.length}
                          </Badge>
                        ) : null}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-[var(--ink-4)] transition-transform",
                            feedbackOpen ? "rotate-180" : "rotate-0"
                          )}
                        />
                      </div>
                    </button>

                    {feedbackOpen ? (
                      <div className="mt-3 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={feedbackDimension}
                        onValueChange={setFeedbackDimension}
                        disabled={feedbackSubmitting || processingState.extraction_rows.length === 0}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="维度" />
                        </SelectTrigger>
                        <SelectContent>
                          {processingState.extraction_rows.map((row) => (
                            <SelectItem key={row.dimension_key} value={row.dimension_key}>
                              {row.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={feedbackType}
                        onValueChange={setFeedbackType}
                        disabled={feedbackSubmitting}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="反馈类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {FEEDBACK_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={feedbackRating}
                        onValueChange={setFeedbackRating}
                        disabled={feedbackSubmitting}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="评分" />
                        </SelectTrigger>
                        <SelectContent>
                          {["1", "2", "3", "4", "5"].map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}/5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <textarea
                      value={feedbackComment}
                      onChange={(event) => setFeedbackComment(event.target.value)}
                      placeholder="这次读取哪里需要改进？"
                      className="min-h-[96px] w-full resize-y rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)] focus:ring-offset-1"
                      disabled={feedbackSubmitting}
                    />

                    <Button
                      type="button"
                      className="w-full gap-2"
                      onClick={handleSubmitFeedback}
                      disabled={feedbackSubmitting || !feedbackDimension}
                    >
                      {feedbackSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageCircle className="h-4 w-4" />
                      )}
                      {feedbackSubmitting ? "正在保存..." : "保存反馈"}
                    </Button>

                    {feedbackError ? (
                      <p className="text-xs leading-5 text-[#8a3318]">{feedbackError}</p>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">
                          最近反馈
                        </p>
                        {feedbackLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ink-4)]" />
                        ) : null}
                      </div>

                      {feedbackItems.length > 0 ? (
                        <div className="space-y-2">
                          {feedbackItems.slice(0, 5).map((item) => {
                            const label =
                              processingState.extraction_rows.find(
                                (row) => row.dimension_key === item.dimension_key
                              )?.label ?? formatProcessingText(item.dimension_key);
                            return (
                              <div
                                key={item.id}
                                className="rounded-[var(--r)] border border-[var(--line-soft)] px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px]">
                                    {label}
                                  </Badge>
                                  <Badge variant="secondary" className="text-[10px]">
                                    {formatProcessingText(item.feedback_type)}
                                  </Badge>
                                  {item.rating ? (
                                    <span className="text-[11px] text-[var(--ink-4)]">
                                      {item.rating}/5
                                    </span>
                                  ) : null}
                                </div>
                                {item.comment ? (
                                  <p className="mt-2 text-xs leading-5 text-[var(--ink)]">
                                    {item.comment}
                                  </p>
                                ) : null}
                                <p className="mt-1 text-[11px] text-[var(--ink-4)]">
                                  {new Date(item.created_at).toLocaleString()}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs leading-5 text-[var(--ink-4)]">
                          这篇论文还没有反馈记录。
                        </p>
                      )}
                    </div>
                      </div>
                    ) : null}
                  </div>

                  {processingState.last_error ? (
                    <div className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a3318]">
                        最近错误
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#8a3318]">
                        {processingState.last_error}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs leading-5 text-[var(--ink-4)]">
                  当前文献库还没有这篇论文的 AI 读取记录。
                </p>
              )}
            </CardContent>
          </Card>

          {/* --- Score Profile (toggle between Bars and Radar) --- */}
          {scores.length > 0 && (
            <Card className="border-[var(--line-soft)] shadow-none">
              <CardHeader className="p-4 pb-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--ink)]">评分结构</h3>
                  <button
                    onClick={() => setShowRadar(!showRadar)}
                    className="text-xs text-[var(--ink-4)] hover:text-[var(--ink)]"
                  >
                    {showRadar ? "显示条形" : "显示雷达"}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {showRadar ? <ScoreRadar scores={scores} /> : <ScoreBars scores={scores} />}
                <p className="text-[10px] text-[var(--ink-4)] mt-1">评分范围 1-5</p>
              </CardContent>
            </Card>
          )}

          {/* --- Related Papers with Axis Control --- */}
          {related.length > 0 && (
            <Card className="border-[var(--line-soft)] shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-[var(--ink-4)]">
                  相似论文
                </CardTitle>
                {/* Axis control buttons */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {[
                    { key: "all", label: "全部" },
                    { key: "method", label: "同方法" },
                    { key: "dataset", label: "同数据" },
                    { key: "mechanism", label: "同机制" },
                    { key: "topic", label: "相似主题" },
                  ].map((btn) => (
                    <button
                      key={btn.key}
                      onClick={() => handleAxisChange(btn.key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        activeAxis === btn.key
                          ? "bg-[#2c4870] text-[var(--paper)]"
                          : "bg-[var(--paper-2)] text-[var(--ink-4)] hover:bg-[var(--paper-2)]/80"
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
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-4)]" />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const displayPapers = axisPapers ?? related;
                      const isTopic = activeAxis === "topic";
                      if (displayPapers.length === 0) {
                        return (
                          <p className="py-4 text-center text-xs text-[var(--ink-4)]">
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
                                className="block rounded-[var(--r)] border border-[var(--line-soft)] p-3 transition-colors hover:bg-[var(--paper-2)]"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-mono text-xs text-[var(--ink-4)]">
                                    {rp.paperId}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isTopic && rp.similarityScore != null ? (
                                      <span className="rounded-full bg-[#e9eef6] px-1.5 py-0.5 text-[10px] font-semibold text-[#223a5e]">
                                        {Math.round(rp.similarityScore * 100)}% match
                                      </span>
                                    ) : rp.sharedAtomCount > 0 ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e9eef6] px-1.5 py-0.5 text-[10px] font-semibold text-[#223a5e] cursor-help">
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
                                                className="inline-block rounded bg-[#e9eef6] px-1.5 py-0.5 text-[10px] text-[#1b2e4d]"
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
                                <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-4)]">
                                  {rp.title ?? "Untitled"}
                                </p>
                                {rp.year && (
                                  <span className="mt-1 text-xs text-[var(--ink-4)]">
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
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#2c4870] hover:text-[#223a5e]"
                >
                  View in Explorer
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}

        </aside>
      </div>

      {/* Floating paper chat */}
      <PaperChat
        paperId={paper.paperId}
        paperTitle={paper.title ?? "Untitled Paper"}
      />

      {/* Generate Ideas modal */}
      {ideaGenOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50">
          <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-[var(--r)] bg-[var(--paper)] border border-[var(--line-soft)] p-6 shadow-[var(--shadow-2)]">
            <button
              onClick={() => { setIdeaGenOpen(false); setIdeaGenResult(""); }}
              className="absolute top-3 right-3 text-[var(--ink-4)] hover:text-[var(--ink)]"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">
              Research Ideas from {paper.title}
            </h2>

            {!ideaGenResult && !ideaGenLoading && (
              <button
                onClick={async () => {
                  setIdeaGenLoading(true);
                  setIdeaGenResult("");
                  const controller = new AbortController();
                  try {
                    const apiUrl = getApiUrl();
                    const res = await activeLibraryFetch(`${apiUrl}/api/generate-ideas`, {
                      method: "POST",
                      headers: withActiveLibraryHeaders({ "Content-Type": "application/json" }),
                      body: JSON.stringify({ paper_ids: [paper.paperId], num_ideas: 3 }),
                      signal: controller.signal,
                    });
                    if (!res.ok) {
                      throw new Error(`Server error: ${res.status}`);
                    }
                    const reader = res.body?.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    if (reader) {
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";
                        for (const line of lines) {
                          if (line.startsWith("data: ")) {
                            try {
                              const data = JSON.parse(line.slice(6));
                              if (data.type === "chunk") setIdeaGenResult(prev => prev + data.text);
                              if (data.type === "error") setIdeaGenResult(prev => prev + "\n\nError: " + data.message);
                            } catch {}
                          }
                        }
                      }
                    }
                  } catch (e) {
                    if ((e as Error).name !== "AbortError") {
                      setIdeaGenResult("Failed to generate ideas. Please try again.");
                    }
                  }
                  setIdeaGenLoading(false);
                }}
                className="w-full rounded-[var(--r)] bg-[var(--ink)] text-[var(--paper)] py-2 font-medium hover:bg-[var(--ink)]/90"
              >
                Generate 3 Research Ideas
              </button>
            )}

            {ideaGenLoading && !ideaGenResult && (
              <div className="flex items-center gap-2 text-[var(--ink-4)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating ideas...
              </div>
            )}

            {ideaGenResult && (
              <div className="prose prose-sm max-w-none text-[var(--ink)] whitespace-pre-wrap">
                {ideaGenResult}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
