"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client/react";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, GitCompareArrows, X, FolderPlus, Plus, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { appConfig } from "@/lib/app-config";
import {
  GET_COLLECTIONS,
  ADD_TO_COLLECTION,
  CREATE_COLLECTION,
} from "@/lib/queries";
import type { ResearchPaperItem, Collection } from "@/lib/types";
import { ExportMenu } from "@/components/shared/export-menu";
import { LitReviewModal } from "@/components/research/lit-review-modal";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fieldBadgeClass(field: string): string {
  const colors = [
    "bg-blue-100 text-blue-800",
    "bg-emerald-100 text-emerald-800",
    "bg-purple-100 text-purple-800",
    "bg-amber-100 text-amber-800",
    "bg-rose-100 text-rose-800",
    "bg-cyan-100 text-cyan-800",
    "bg-indigo-100 text-indigo-800",
    "bg-teal-100 text-teal-800",
  ];
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    hash = (hash * 31 + field.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function getResearchSourceLabel(): string {
  const sourceName = appConfig.sourceName.trim();
  const paperLabel = appConfig.sourcePaperLabel.trim();
  if (!sourceName || sourceName === "Source Library" || sourceName === "Local Library") {
    return paperLabel || "Library source";
  }
  const singularPaperLabel = paperLabel.endsWith("s") ? paperLabel.slice(0, -1) : paperLabel;
  return singularPaperLabel ? `${sourceName} ${singularPaperLabel}` : sourceName;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResearchResultsListProps {
  papers: ResearchPaperItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedPaperId: string | null;
  onSelectPaper: (paperId: string) => void;
  allPaperIds: string[];
  compareIds: Set<string>;
  onToggleCompare: (paperId: string, e: React.MouseEvent) => void;
  onClearCompare: () => void;
  compareHref: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResearchResultsList({
  papers,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  selectedPaperId,
  onSelectPaper,
  allPaperIds,
  compareIds,
  onToggleCompare,
  onClearCompare,
  compareHref,
}: ResearchResultsListProps) {
  const router = useRouter();
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [litReviewOpen, setLitReviewOpen] = useState(false);

  const compareCount = compareIds.size;
  const canCompare = compareCount >= 2 && compareCount <= 8;

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 border-b border-border/40 px-3 py-3">
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
        <div className="paper-panel rounded-[1.4rem] px-5 py-4">
          <p className="section-kicker">{t("research.results.emptyKicker")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("research.results.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Paper list */}
      <div className="flex-1 overflow-y-auto">
        {papers.map((paper) => {
          const isCompareSelected = compareIds.has(paper.paperId);
          const isCompareDisabled = !isCompareSelected && compareIds.size >= 8;
          const authorLabel = paper.authors.join(", ");
          const sourceLabel = getResearchSourceLabel();
          return (
            <div
              key={paper.paperId}
              className={cn(
                "mx-2 my-2 flex w-auto gap-2 rounded-[1.15rem] border border-transparent px-3 py-3 text-left transition-colors hover:bg-[color:oklch(var(--accent)/0.42)]",
                selectedPaperId === paper.paperId &&
                  "border-[color:color-mix(in_oklch,oklch(var(--primary))_18%,transparent)] bg-primary/5",
                isCompareSelected && "bg-[color:oklch(var(--accent)/0.55)]"
              )}
            >
              {/* Checkbox */}
              <div
                className="flex shrink-0 items-start pt-1"
                onClick={(e) => {
                  if (!isCompareDisabled) onToggleCompare(paper.paperId, e);
                  else e.stopPropagation();
                }}
              >
                <input
                  type="checkbox"
                  checked={isCompareSelected}
                  disabled={isCompareDisabled}
                  readOnly
                  className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                />
              </div>

              {/* Paper info button */}
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left"
                onClick={() => onSelectPaper(paper.paperId)}
              >
                {/* Title */}
                <p className="w-full font-display line-clamp-2 text-left text-[1.05rem] leading-snug text-foreground">
                  {paper.title || paper.paperId}
                </p>

                {/* TLDR */}
                {paper.tldr && (
                  <p className="w-full line-clamp-2 text-left text-xs text-muted-foreground">
                    {paper.tldr}
                  </p>
                )}

                {/* Meta rows */}
                <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {paper.year && <span className="tabular-nums">{paper.year}</span>}
                  <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {sourceLabel}
                  </span>
                  {paper.hasCard && (
                    <FileText className="ml-auto h-3 w-3 shrink-0 text-primary/60" />
                  )}
                </div>
                {paper.authors.length > 0 && (
                  <p
                    title={authorLabel}
                    className="w-full truncate text-xs text-muted-foreground"
                  >
                    {authorLabel}
                  </p>
                )}

                {/* Field badges + score */}
                <div className="flex w-full items-center gap-1.5">
                  {paper.fields.slice(0, 2).map((f) => (
                    <span
                      key={f}
                      title={f}
                      className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${fieldBadgeClass(f)}`}
                    >
                      {f.length > 16 ? f.slice(0, 14) + ".." : f}
                    </span>
                  ))}
                  {paper.fields.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{paper.fields.length - 2}
                    </span>
                  )}
                  {paper.averageScore != null && (
                    <span
                      className={cn(
                        "ml-auto text-[10px] font-medium tabular-nums",
                        paper.averageScore >= 4
                          ? "text-green-600"
                          : paper.averageScore >= 3
                            ? "text-yellow-600"
                            : "text-gray-400"
                      )}
                    >
                      {paper.averageScore.toFixed(1)}
                    </span>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Compare action bar (when papers selected) */}
      {compareCount > 0 && (
        <div className="paper-panel mx-2 mb-2 flex items-center justify-between rounded-[1.1rem] px-3 py-2">
          <span className="text-[10px] font-medium text-foreground">
            {t("common.counts.selected", { count: compareCount })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={!canCompare}
              onClick={() => {
                if (compareHref) {
                  router.push(compareHref);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitCompareArrows className="h-2.5 w-2.5" />
              {t("research.results.compare")}
            </button>
            <AddToCollectionInline paperIds={Array.from(compareIds)} />
            <button
              onClick={() => setLitReviewOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/85 px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-background"
            >
              <BookOpen className="h-2.5 w-2.5" />
              {t("research.results.litReview")}
            </button>
            <ExportMenu paperIds={Array.from(compareIds)} label={t("common.actions.export")} compact />
            <button
              onClick={onClearCompare}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
              {t("common.actions.clear")}
            </button>
          </div>
        </div>
      )}

      {/* Footer: pagination + export */}
      <div className="paper-panel mx-2 mb-2 flex items-center justify-between rounded-[1.1rem] px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? t("common.counts.rangeOfTotal", {
                  start: (page - 1) * pageSize + 1,
                  end: Math.min(page * pageSize, total),
                  total,
                })
              : ""}
          </p>
          {allPaperIds.length > 0 && (
            <ExportMenu paperIds={allPaperIds} label={t("common.actions.export")} compact />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t("common.actions.previous")}
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page}/{totalPages}
          </span>
          <button
            className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {t("common.actions.next")}
          </button>
        </div>
      </div>

      {/* Lit Review Modal */}
      {litReviewOpen && (
        <LitReviewModal
          open={litReviewOpen}
          onClose={() => setLitReviewOpen(false)}
          paperIds={Array.from(compareIds)}
        />
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Inline "Add to Collection" dropdown for the action bar
// ---------------------------------------------------------------------------

function AddToCollectionInline({ paperIds }: { paperIds: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [added, setAdded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, refetch } = useQuery<{ collections: Collection[] }>(GET_COLLECTIONS, {
    skip: !open,
  });
  const [addToCol] = useMutation(ADD_TO_COLLECTION);
  const [createCol] = useMutation(CREATE_COLLECTION);

  const collections = data?.collections ?? [];

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

  const handleAdd = useCallback(
    async (colId: number) => {
      for (const pid of paperIds) {
        await addToCol({ variables: { collectionId: colId, paperId: pid } });
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
      refetch();
    },
    [paperIds, addToCol, refetch]
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const result = await createCol({ variables: { name: newName.trim() } });
    const created = (result.data as { createCollection: Collection } | undefined)?.createCollection;
    if (created) {
      for (const pid of paperIds) {
        await addToCol({ variables: { collectionId: created.id, paperId: pid } });
      }
    }
    setNewName("");
    setCreating(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    refetch();
  }, [newName, createCol, addToCol, paperIds, refetch]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background/85 px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-background"
      >
        <FolderPlus className="h-2.5 w-2.5" />
        {added ? t("research.results.added") : t("research.results.collection")}
      </button>

      {open && (
        <div className="paper-panel absolute right-0 bottom-full z-50 mb-2 w-56 rounded-[1rem] py-1">
          {collections.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t("research.results.noCollections")}</p>
          )}
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => handleAdd(col.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
            >
              <FolderPlus className="h-3 w-3 text-muted-foreground" />
              <span className="truncate flex-1">{col.name}</span>
              <span className="text-[10px] text-muted-foreground">{col.paperCount}</span>
            </button>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            {creating ? (
              <div className="px-3 py-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("research.results.newCollection")}
                  className="w-full rounded-[0.8rem] border border-input bg-background/85 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-[color:oklch(var(--accent)/0.45)]"
              >
                <Plus className="h-3 w-3" />
                {t("research.results.newCollection")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
