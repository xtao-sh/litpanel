"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client/react";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, GitCompareArrows, X, FolderPlus, Plus, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GET_COLLECTIONS,
  ADD_TO_COLLECTION,
  CREATE_COLLECTION,
} from "@/lib/queries";
import type { ResearchPaperItem, Collection } from "@/lib/types";
import { ExportMenu } from "@/components/shared/export-menu";
import { LitReviewModal } from "@/components/research/lit-review-modal";

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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [litReviewOpen, setLitReviewOpen] = useState(false);

  const compareCount = compareIds.size;
  const canCompare = compareCount >= 2 && compareCount <= 8;

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 border-b border-border/50 px-3 py-3">
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
        <p className="text-sm text-muted-foreground">No papers found.</p>
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
          return (
            <div
              key={paper.paperId}
              className={cn(
                "flex w-full gap-2 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                selectedPaperId === paper.paperId &&
                  "border-l-2 border-l-primary bg-primary/5",
                isCompareSelected && "bg-blue-50/60"
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
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {/* Paper info button */}
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col gap-1.5"
                onClick={() => onSelectPaper(paper.paperId)}
              >
                {/* Title */}
                <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                  {paper.title || paper.paperId}
                </p>

                {/* TLDR */}
                {paper.tldr && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {paper.tldr.length > 100 ? paper.tldr.slice(0, 97) + "..." : paper.tldr}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {paper.year && <span className="tabular-nums">{paper.year}</span>}
                  {paper.authors.length > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <span className="truncate">{paper.authors[0]}{paper.authors.length > 1 ? ` +${paper.authors.length - 1}` : ""}</span>
                    </>
                  )}
                  {paper.hasCard && (
                    <FileText className="ml-auto h-3 w-3 shrink-0 text-blue-400" />
                  )}
                </div>

                {/* Field badges + score */}
                <div className="flex items-center gap-1.5">
                  {paper.fields.slice(0, 2).map((f) => (
                    <span
                      key={f}
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
        <div className="flex items-center justify-between border-t border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-[10px] font-medium text-blue-800">
            {compareCount} selected
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={!canCompare}
              onClick={() => {
                if (compareHref) {
                  router.push(compareHref);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <GitCompareArrows className="h-2.5 w-2.5" />
              Compare
            </button>
            <AddToCollectionInline paperIds={Array.from(compareIds)} />
            <button
              onClick={() => setLitReviewOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <BookOpen className="h-2.5 w-2.5" />
              Lit Review
            </button>
            <ExportMenu paperIds={Array.from(compareIds)} label="Export" compact />
            <button
              onClick={onClearCompare}
              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-100"
            >
              <X className="h-2.5 w-2.5" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Footer: pagination + export */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`
              : ""}
          </p>
          {allPaperIds.length > 0 && (
            <ExportMenu paperIds={allPaperIds} label="Export" compact />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page}/{totalPages}
          </span>
          <button
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
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
        className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
      >
        <FolderPlus className="h-2.5 w-2.5" />
        {added ? "Added!" : "Collection"}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {collections.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-gray-500">No collections yet.</p>
          )}
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => handleAdd(col.id)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 transition-colors"
            >
              <FolderPlus className="h-3 w-3 text-gray-400" />
              <span className="truncate flex-1">{col.name}</span>
              <span className="text-[10px] text-gray-400">{col.paperCount}</span>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New collection"
                  className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-3 w-3" />
                New Collection
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
