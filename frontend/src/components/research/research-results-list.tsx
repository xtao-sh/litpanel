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
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[var(--forest-soft)] text-[var(--forest-2)]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[#f4ead8] text-[#654814]",
    "bg-[#f4dfd5] text-[#742b14]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[var(--forest-soft)] text-[var(--forest-2)]",
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
            <div key={i} className="space-y-2 border-b border-[var(--line-soft)]/40 px-3 py-3">
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
        <div className="lp-card rounded-[var(--r-md)] px-5 py-4">
          <p className="section-kicker">{t("research.results.emptyKicker")}</p>
          <p className="mt-2 text-sm text-[var(--ink-4)]">{t("research.results.emptyBody")}</p>
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
                "mx-1 my-1.5 flex w-auto gap-2 rounded-[0.9rem] border border-transparent px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--paper-2)]",
                selectedPaperId === paper.paperId &&
                  "border-[var(--forest)]/20 bg-[var(--ink)]/5",
                isCompareSelected && "bg-[var(--paper-3)]"
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
                  className="h-3.5 w-3.5 cursor-pointer rounded border-[var(--line)] text-[var(--forest)] focus:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-40"
                />
              </div>

              {/* Paper info button */}
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left"
                onClick={() => onSelectPaper(paper.paperId)}
                title={[paper.tldr, authorLabel].filter(Boolean).join("\n")}
              >
                {/* Title */}
                <p className="w-full line-clamp-2 text-left text-sm font-medium leading-snug text-[var(--ink)]">
                  {paper.title || paper.paperId}
                </p>

                {/* Meta rows */}
                <div className="flex w-full flex-wrap items-center gap-2 text-xs text-[var(--ink-4)]">
                  {paper.year && <span className="tabular-nums">{paper.year}</span>}
                  <span className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                    {sourceLabel}
                  </span>
                  {paper.hasCard && (
                    <FileText className="ml-auto h-3 w-3 shrink-0 text-[var(--forest)]" />
                  )}
                </div>

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
                    <span className="text-[10px] text-[var(--ink-4)]">
                      +{paper.fields.length - 2}
                    </span>
                  )}
                  {paper.averageScore != null && (
                    <span
                      className={cn(
                        "ml-auto text-[10px] font-medium tabular-nums",
                        paper.averageScore >= 4
                          ? "text-[var(--forest)]"
                          : paper.averageScore >= 3
                            ? "text-[#7a5a18]"
                            : "text-[var(--ink-5)]"
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
        <div className="lp-card mx-2 mb-2 flex items-center justify-between rounded-[var(--r-md)] px-3 py-2">
          <span className="text-[10px] font-medium text-[var(--ink)]">
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
              className="inline-flex items-center gap-1 rounded-full bg-[var(--ink)] px-2.5 py-1 text-[10px] font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink)]/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitCompareArrows className="h-2.5 w-2.5" />
              {t("research.results.compare")}
            </button>
            <AddToCollectionInline paperIds={Array.from(compareIds)} />
            <button
              onClick={() => setLitReviewOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-2.5 py-1 text-[10px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
            >
              <BookOpen className="h-2.5 w-2.5" />
              {t("research.results.litReview")}
            </button>
            <ExportMenu paperIds={Array.from(compareIds)} label={t("common.actions.export")} compact />
            <button
              onClick={onClearCompare}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
            >
              <X className="h-2.5 w-2.5" />
              {t("common.actions.clear")}
            </button>
          </div>
        </div>
      )}

      {/* Footer: pagination + export */}
      <div className="lp-card mx-2 mb-2 flex items-center justify-between rounded-[var(--r-md)] px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-[var(--ink-4)]">
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
            className="rounded-full px-2.5 py-1 text-xs text-[var(--ink-4)] hover:bg-[var(--paper-2)] disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t("common.actions.previous")}
          </button>
          <span className="text-xs tabular-nums text-[var(--ink-4)]">
            {page}/{totalPages}
          </span>
          <button
            className="rounded-full px-2.5 py-1 text-xs text-[var(--ink-4)] hover:bg-[var(--paper-2)] disabled:opacity-40"
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
        className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-2.5 py-1 text-[10px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
      >
        <FolderPlus className="h-2.5 w-2.5" />
        {added ? t("research.results.added") : t("research.results.collection")}
      </button>

      {open && (
        <div className="lp-card absolute right-0 bottom-full z-50 mb-2 w-56 rounded-[var(--r-md)] py-1">
          {collections.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-[var(--ink-4)]">{t("research.results.noCollections")}</p>
          )}
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => handleAdd(col.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--paper-2)]"
            >
              <FolderPlus className="h-3 w-3 text-[var(--ink-4)]" />
              <span className="truncate flex-1">{col.name}</span>
              <span className="text-[10px] text-[var(--ink-4)]">{col.paperCount}</span>
            </button>
          ))}
          <div className="mt-1 border-t border-[var(--line-soft)] pt-1">
            {creating ? (
              <div className="px-3 py-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("research.results.newCollection")}
                  className="w-full rounded-[0.8rem] border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--forest)]"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--forest)] hover:bg-[var(--paper-2)]"
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
