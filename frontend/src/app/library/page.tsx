"use client";

import React, { useState, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@apollo/client/react";
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
} from "@/lib/queries";
import type { Paper, NoteItem, Collection } from "@/lib/types";
import { LitReviewModal } from "@/components/research/lit-review-modal";
import { ExportMenu } from "@/components/shared/export-menu";
import { NoteRenderer, extractNoteReferences } from "@/components/shared/note-renderer";
import { QueryErrorBanner } from "@/components/shared/query-error-banner";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "to_read", label: "To Read", color: "bg-amber-400" },
  { value: "reading", label: "Reading", color: "bg-blue-400" },
  { value: "skimmed", label: "Skimmed", color: "bg-violet-400" },
  { value: "read_in_detail", label: "Read in Detail", color: "bg-green-500" },
];

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Not set";
  const tab = STATUS_TABS.find((t) => t.value === status);
  return tab ? tab.label : status.replace(/_/g, " ");
}

function statusColor(status: string | null | undefined): string {
  if (!status) return "bg-gray-300";
  const tab = STATUS_TABS.find((t) => t.value === status);
  return tab?.color ?? "bg-gray-300";
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
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
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
      className="flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
    >
      <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
        {paper.paperId}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {paper.title ?? "Untitled"}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {paper.year && (
            <span className="text-xs text-muted-foreground">{paper.year}</span>
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
          <span className="text-xs text-muted-foreground">{statusLabel(paper.readingStatus)}</span>
        </span>
      )}
      {paper.averageScore !== null && paper.averageScore !== undefined && (
        <span className="text-xs font-semibold text-muted-foreground tabular-nums w-8 text-right shrink-0">
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

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">
        {total} item{total !== 1 ? "s" : ""}
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
        <span className="text-xs text-muted-foreground px-2">
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

  const { data, loading, error } = useQuery<{
    bookmarks: { items: Paper[]; total: number };
  }>(GET_BOOKMARKS, {
    variables: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  });

  const papers = data?.bookmarks?.items ?? [];
  const total = data?.bookmarks?.total ?? 0;

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
      {papers.length > 0 && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-border">
          <ExportMenu paperIds={papers.map((p) => p.paperId)} label="Export" compact />
        </div>
      )}
      <div className="divide-y divide-border">
        {papers.map((p) => (
          <PaperRow key={p.paperId} paper={p} />
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

  const { data, loading, error } = useQuery<{
    readingList: { items: Paper[]; total: number };
  }>(GET_READING_LIST, {
    variables: {
      status: queryStatus,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
  });

  const papers = data?.readingList?.items ?? [];
  const total = data?.readingList?.total ?? 0;

  return (
    <div>
      {/* Status sub-tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
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
          <div className="divide-y divide-border">
            {papers.map((p) => (
              <PaperRow key={p.paperId} paper={p} />
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

  const { data, loading, error } = useQuery<{
    allNotes: { items: NoteItem[]; total: number };
  }>(GET_ALL_NOTES, {
    variables: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  });

  const notes = data?.allNotes?.items ?? [];
  const total = data?.allNotes?.total ?? 0;

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
      <div className="divide-y divide-border">
        {notes.map((note) => {
          const href =
            note.entityType === "paper"
              ? `/paper/${note.entityId}`
              : note.entityType === "atom"
              ? `/atom/${note.entityId}`
              : "#";
          return (
            <Link
              key={`${note.entityType}-${note.entityId}`}
              href={href}
              className="block px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {note.entityType}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {note.entityId}
                </span>
                {(() => {
                  const refs = extractNoteReferences(note.note);
                  const totalRefs = refs.papers.length + refs.atoms.length;
                  return totalRefs > 0 ? (
                    <span className="text-[10px] text-blue-500">
                      {totalRefs} link{totalRefs !== 1 ? "s" : ""}
                    </span>
                  ) : null;
                })()}
                {note.updatedAt && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                <NoteRenderer content={note.note} />
              </div>
            </Link>
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

  const handleOpenLitReview = useCallback(() => {
    if (!viewingCollection) return;
    const ids = papers.map((p) => p.paperId);
    setLitReviewPaperIds(ids);
    setLitReviewOpen(true);
  }, [viewingCollection, papers]);

  if (loading) return <TableSkeleton />;
  if (error) return <QueryErrorBanner error={error} message="Failed to load collections." />;

  // Viewing a specific collection's papers
  if (viewingCollection) {
    return (
      <div>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setViewingCollection(null); setPage(1); }}
            className="h-7 w-7 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {viewingCollection.name}
            </h3>
            {viewingCollection.description && (
              <p className="text-xs text-muted-foreground truncate">{viewingCollection.description}</p>
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
            <div className="divide-y divide-border">
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
                    className="px-3 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs text-muted-foreground">
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
        <div className="divide-y divide-border">
          {collections.map((col) => (
            <div
              key={col.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => { setViewingCollection(col); setPage(1); }}
            >
              <FolderOpen className="h-5 w-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {col.name}
                </p>
                {col.description && (
                  <p className="text-xs text-muted-foreground truncate">{col.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {col.paperCount} paper{col.paperCount !== 1 ? "s" : ""}
              </Badge>
              <span className="text-[10px] text-muted-foreground shrink-0">
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
                  className="p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
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
                  className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
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
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  const [activeTab, setActiveTab] = useState("bookmarks");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Library
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your bookmarks, reading list, notes, and collections.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-11 gap-1 p-1">
          <TabsTrigger value="bookmarks" className="gap-1.5 px-4 text-sm">
            <Bookmark className="h-3.5 w-3.5" />
            Bookmarks
          </TabsTrigger>
          <TabsTrigger value="reading" className="gap-1.5 px-4 text-sm">
            <BookOpen className="h-3.5 w-3.5" />
            Reading List
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 px-4 text-sm">
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5 px-4 text-sm">
            <FolderOpen className="h-3.5 w-3.5" />
            Collections
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-border shadow-none overflow-hidden">
        <CardContent className="p-0">
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
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Library
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your bookmarks, reading list, notes, and collections.
            </p>
          </div>
          <div className="h-96 animate-pulse rounded-lg border border-border bg-muted" />
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}
