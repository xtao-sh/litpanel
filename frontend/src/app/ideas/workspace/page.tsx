"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useLazyQuery } from "@apollo/client/react";
import {
  Plus,
  Trash2,
  ChevronLeft,
  Search,
  FlaskConical,
  Database,
  X,
  CheckCircle,
  AlertCircle,
  Scale,
  LayoutList,
  Columns3,
  Link2,
  Unlink,
} from "lucide-react";

import {
  GET_USER_IDEAS,
  CREATE_USER_IDEA,
  UPDATE_USER_IDEA,
  DELETE_USER_IDEA,
  ADD_PAPER_TO_IDEA,
  REMOVE_PAPER_FROM_IDEA,
  CHECK_NOVELTY,
  SUGGEST_METHODS,
  SUGGEST_DATA,
  LINK_IDEAS,
  UNLINK_IDEAS,
} from "@/lib/queries";
import type {
  UserIdea,
  NoveltyCheck,
  MethodSuggestion,
  DataSuggestion,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DebateModal } from "@/components/ideas/debate-modal";
import { PaperSearchPicker } from "@/components/shared/paper-search-picker";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = ["draft", "exploring", "developing", "proposal", "archived"] as const;

function statusStyle(status: string) {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700 border-border";
    case "exploring":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "developing":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "proposal":
      return "bg-green-100 text-green-700 border-green-200";
    case "archived":
      return "bg-red-100 text-red-600 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-border";
  }
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateIdeaDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Research Idea</DialogTitle>
          <DialogDescription>
            Create a new research idea to develop and refine.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title *</label>
            <input
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., Impact of AI on Chinese manufacturing"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <textarea
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              placeholder="Brief description of the idea..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!title.trim()}
            onClick={() => {
              onCreate(title.trim(), description.trim());
              onClose();
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Idea list card
// ---------------------------------------------------------------------------

function IdeaListCard({
  idea,
  onSelect,
  onDelete,
}: {
  idea: UserIdea;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const date = idea.updatedAt
    ? new Date(idea.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-px"
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-foreground truncate">
              {idea.title}
            </h4>
            {idea.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {idea.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Badge className={`text-[10px] ${statusStyle(idea.status)}`}>
                {idea.status}
              </Badge>
              {date && <span className="text-[10px] text-muted-foreground">{date}</span>}
              {idea.relatedPaperIds.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {idea.relatedPaperIds.length} paper{idea.relatedPaperIds.length !== 1 ? "s" : ""}
                </span>
              )}
              {(idea.relatedIdeaIds?.length ?? 0) > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  <Link2 className="inline h-2.5 w-2.5 mr-0.5" />
                  {idea.relatedIdeaIds.length} linked
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Kanban card (compact)
// ---------------------------------------------------------------------------

function IdeaKanbanCard({
  idea,
  onClick,
}: {
  idea: UserIdea;
  onClick: () => void;
}) {
  const date = idea.createdAt
    ? new Date(idea.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-px mb-2"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <h4 className="text-xs font-semibold text-foreground line-clamp-2">
          {idea.title}
        </h4>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {date && <span className="text-[10px] text-muted-foreground">{date}</span>}
          {idea.relatedPaperIds.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {idea.relatedPaperIds.length} paper{idea.relatedPaperIds.length !== 1 ? "s" : ""}
            </span>
          )}
          {(idea.relatedIdeaIds?.length ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground">
              <Link2 className="inline h-2.5 w-2.5 mr-0.5" />
              {idea.relatedIdeaIds.length}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Linked ideas picker dialog
// ---------------------------------------------------------------------------

function LinkIdeaPicker({
  open,
  currentIdeaId,
  allIdeas,
  linkedIds,
  onLink,
  onClose,
}: {
  open: boolean;
  currentIdeaId: number;
  allIdeas: UserIdea[];
  linkedIds: number[];
  onLink: (ideaId: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const available = allIdeas.filter(
    (i) => i.id !== currentIdeaId && !linkedIds.includes(i.id)
  );
  const filtered = search.trim()
    ? available.filter((i) =>
        i.title.toLowerCase().includes(search.toLowerCase())
      )
    : available;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Link to Another Idea</DialogTitle>
          <DialogDescription>
            Search and select an idea to link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search ideas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">No ideas available to link.</p>
            )}
            {filtered.map((idea) => (
              <button
                key={idea.id}
                className="w-full text-left rounded-md px-3 py-2 text-xs hover:bg-blue-50 transition-colors"
                onClick={() => {
                  onLink(idea.id);
                  onClose();
                }}
              >
                <span className="font-medium text-foreground">{idea.title}</span>
                <Badge className={`ml-2 text-[9px] ${statusStyle(idea.status)}`}>
                  {idea.status}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Idea development view
// ---------------------------------------------------------------------------

function IdeaDevelopmentView({
  idea,
  allIdeas,
  onBack,
  onSelectIdea,
}: {
  idea: UserIdea;
  allIdeas: UserIdea[];
  onBack: () => void;
  onSelectIdea: (id: number) => void;
}) {
  // Editable state
  const [title, setTitle] = useState(idea.title);
  const [status, setStatus] = useState(idea.status);
  const [researchQuestion, setResearchQuestion] = useState(idea.researchQuestion);
  const [proposedMethod, setProposedMethod] = useState(idea.proposedMethod);
  const [dataNeeded, setDataNeeded] = useState(idea.dataNeeded);
  const [notes, setNotes] = useState(idea.notes);
  const [debateOpen, setDebateOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  // Mutations
  const [updateIdea] = useMutation(UPDATE_USER_IDEA);
  const [addPaper] = useMutation(ADD_PAPER_TO_IDEA, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });
  const [removePaper] = useMutation(REMOVE_PAPER_FROM_IDEA, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });
  const [linkIdeasMut] = useMutation(LINK_IDEAS, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });
  const [unlinkIdeasMut] = useMutation(UNLINK_IDEAS, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });

  // System assistance lazy queries
  const [checkNovelty, { data: noveltyData, loading: noveltyLoading }] =
    useLazyQuery<{ checkNovelty: NoveltyCheck }>(CHECK_NOVELTY);
  const [suggestMethods, { data: methodsData, loading: methodsLoading }] =
    useLazyQuery<{ suggestMethods: MethodSuggestion[] }>(SUGGEST_METHODS);
  const [suggestData, { data: dataData, loading: dataLoading }] =
    useLazyQuery<{ suggestData: DataSuggestion[] }>(SUGGEST_DATA);

  // Current related papers (local state so we can update optimistically)
  const [relatedPapers, setRelatedPapers] = useState<string[]>(idea.relatedPaperIds);
  const [linkedIdeaIds, setLinkedIdeaIds] = useState<number[]>(idea.relatedIdeaIds ?? []);

  // Auto-save on blur
  const saveField = useCallback(
    (field: string, value: string) => {
      updateIdea({
        variables: { id: idea.id, [field]: value },
      });
    },
    [updateIdea, idea.id]
  );

  const ideaText = [title, researchQuestion, proposedMethod, dataNeeded].filter(Boolean).join(". ");

  const handleRemovePaper = (pid: string) => {
    setRelatedPapers(relatedPapers.filter((p) => p !== pid));
    removePaper({ variables: { ideaId: idea.id, paperId: pid } });
  };

  const handleLinkIdea = (linkedId: number) => {
    setLinkedIdeaIds((prev) => [...prev, linkedId]);
    linkIdeasMut({ variables: { ideaId: idea.id, linkedIdeaId: linkedId } });
  };

  const handleUnlinkIdea = (linkedId: number) => {
    setLinkedIdeaIds((prev) => prev.filter((id) => id !== linkedId));
    unlinkIdeasMut({ variables: { ideaId: idea.id, linkedIdeaId: linkedId } });
  };

  const linkedIdeas = allIdeas.filter((i) => linkedIdeaIds.includes(i.id));

  const novelty = noveltyData?.checkNovelty;
  const methods = methodsData?.suggestMethods;
  const datasets = dataData?.suggestData;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back to list
      </Button>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left column: editable form (3/5) */}
        <div className="xl:col-span-3 space-y-4">
          {/* Title */}
          <div>
            <input
              className="w-full text-xl font-bold text-foreground border-0 border-b border-transparent focus:border-blue-500 focus:outline-none bg-transparent pb-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveField("title", title)}
            />
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    status === s
                      ? statusStyle(s) + " border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setStatus(s);
                    saveField("status", s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea fields */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Research Question
              </label>
              <textarea
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                placeholder="What question does this idea try to answer?"
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
                onBlur={() => saveField("researchQuestion", researchQuestion)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Proposed Method
              </label>
              <textarea
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                placeholder="How would you investigate this?"
                value={proposedMethod}
                onChange={(e) => setProposedMethod(e.target.value)}
                onBlur={() => saveField("proposedMethod", proposedMethod)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Data Needed
              </label>
              <textarea
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
                placeholder="What data sources would you need?"
                value={dataNeeded}
                onChange={(e) => setDataNeeded(e.target.value)}
                onBlur={() => saveField("dataNeeded", dataNeeded)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Notes
              </label>
              <textarea
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                placeholder="Any additional thoughts..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveField("notes", notes)}
              />
            </div>
          </div>

          {/* Related papers */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Related Papers
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {relatedPapers.map((pid) => (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-600"
                >
                  <Link href={`/paper/${pid}`} className="hover:underline">
                    {pid}
                  </Link>
                  <button
                    className="text-blue-400 hover:text-red-500"
                    onClick={() => handleRemovePaper(pid)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <PaperSearchPicker
              className="mt-2"
              placeholder="Search papers by title or ID..."
              onSelect={(paperId) => {
                if (!relatedPapers.includes(paperId)) {
                  setRelatedPapers([...relatedPapers, paperId]);
                  addPaper({ variables: { ideaId: idea.id, paperId } });
                }
              }}
            />
          </div>

          {/* Linked Ideas (6.5) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Linked Ideas
            </label>
            {linkedIdeas.length > 0 && (
              <div className="mt-1 space-y-1">
                {linkedIdeas.map((li) => (
                  <div
                    key={li.id}
                    className="flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-1.5 group"
                  >
                    <Link2 className="h-3 w-3 text-indigo-400 shrink-0" />
                    <button
                      className="text-xs font-medium text-indigo-700 hover:underline text-left flex-1 min-w-0 truncate"
                      onClick={() => onSelectIdea(li.id)}
                    >
                      {li.title}
                    </button>
                    <Badge className={`text-[9px] shrink-0 ${statusStyle(li.status)}`}>
                      {li.status}
                    </Badge>
                    <button
                      className="text-indigo-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      title="Unlink"
                      onClick={() => handleUnlinkIdea(li.id)}
                    >
                      <Unlink className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              onClick={() => setLinkPickerOpen(true)}
            >
              <Link2 className="mr-1.5 h-3 w-3" />
              Link to another idea
            </Button>
          </div>
        </div>

        {/* Right column: system assistance (2/5) */}
        <div className="xl:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Research Assistant
          </h3>

          {/* Launch Debate */}
          <Card>
            <CardContent className="p-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                disabled={!ideaText.trim()}
                onClick={() => setDebateOpen(true)}
              >
                <Scale className="mr-2 h-3.5 w-3.5" />
                Launch Debate
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Multi-agent debate: Advocate, Skeptic, Methodologist + Moderator verdict
              </p>
            </CardContent>
          </Card>

          {/* Check Novelty */}
          <Card>
            <CardContent className="p-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                disabled={noveltyLoading || !ideaText.trim()}
                onClick={() =>
                  checkNovelty({ variables: { text: ideaText } })
                }
              >
                <Search className="mr-2 h-3.5 w-3.5" />
                {noveltyLoading ? "Checking..." : "Check Novelty"}
              </Button>

              {novelty && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {novelty.isNovel ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-xs font-medium text-green-700">
                          Appears novel
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        <span className="text-xs font-medium text-yellow-700">
                          Similar work exists
                        </span>
                      </>
                    )}
                  </div>
                  {novelty.similarPapers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase mt-2">
                        Similar Papers
                      </p>
                      {novelty.similarPapers.slice(0, 5).map((p) => (
                        <div key={p.paperId} className="py-1.5 border-b border-border last:border-0">
                          <Link
                            href={`/paper/${p.paperId}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {p.title || p.paperId}
                          </Link>
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            {(p.similarityScore * 100).toFixed(0)}% match
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {novelty.similarIdeas.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase mt-2">
                        Similar Ideas
                      </p>
                      {novelty.similarIdeas.slice(0, 3).map((i) => (
                        <div key={i.id} className="py-1.5 border-b border-border last:border-0">
                          <span className="text-xs text-muted-foreground">{i.title}</span>
                          {i.composite !== null && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              Score: {i.composite.toFixed(1)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suggest Methods (5.2 - with "Use" buttons) */}
          <Card>
            <CardContent className="p-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                disabled={methodsLoading || !ideaText.trim()}
                onClick={() =>
                  suggestMethods({ variables: { text: ideaText, limit: 8 } })
                }
              >
                <FlaskConical className="mr-2 h-3.5 w-3.5" />
                {methodsLoading ? "Searching..." : "Suggest Methods"}
              </Button>

              {methods && methods.length > 0 && (
                <div className="mt-3 space-y-1">
                  {methods.map((m) => (
                    <div key={m.slug} className="py-1.5 border-b border-border last:border-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/atom/${m.slug}`}
                            className="text-xs font-medium text-foreground hover:text-blue-600"
                          >
                            {m.title}
                          </Link>
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            {(m.relevanceScore * 100).toFixed(0)}%
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1.5 text-[10px] text-blue-600 hover:bg-blue-50 shrink-0"
                          onClick={() => {
                            setProposedMethod((prev) =>
                              prev + (prev ? "\n" : "") + `${m.title}: ${m.whenToUse || m.description || ""}`
                            );
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      {m.whenToUse && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                          {m.whenToUse}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Find Data (5.2 - with "Use" buttons) */}
          <Card>
            <CardContent className="p-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
                disabled={dataLoading || !ideaText.trim()}
                onClick={() =>
                  suggestData({ variables: { text: ideaText, limit: 8 } })
                }
              >
                <Database className="mr-2 h-3.5 w-3.5" />
                {dataLoading ? "Searching..." : "Find Data Sources"}
              </Button>

              {datasets && datasets.length > 0 && (
                <div className="mt-3 space-y-1">
                  {datasets.map((d) => (
                    <div key={d.slug} className="py-1.5 border-b border-border last:border-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Link
                            href={`/atom/${d.slug}`}
                            className="text-xs font-medium text-foreground hover:text-blue-600"
                          >
                            {d.title}
                          </Link>
                          {d.access && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] py-0 ${
                                d.access.toLowerCase().includes("public")
                                  ? "border-green-300 text-green-700"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {d.access}
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1.5 text-[10px] text-blue-600 hover:bg-blue-50 shrink-0"
                          onClick={() => {
                            setDataNeeded((prev) =>
                              prev + (prev ? "\n" : "") + `${d.title} (${d.access || "unknown access"})`
                            );
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      {d.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                          {d.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Debate modal */}
      <DebateModal
        open={debateOpen}
        onClose={() => setDebateOpen(false)}
        ideaTitle={title}
        ideaText={ideaText}
        paperIds={relatedPapers}
      />

      {/* Link idea picker dialog */}
      <LinkIdeaPicker
        open={linkPickerOpen}
        currentIdeaId={idea.id}
        allIdeas={allIdeas}
        linkedIds={linkedIdeaIds}
        onLink={handleLinkIdea}
        onClose={() => setLinkPickerOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban view (6.6)
// ---------------------------------------------------------------------------

function KanbanView({
  ideas,
  onSelectIdea,
}: {
  ideas: UserIdea[];
  onSelectIdea: (id: number) => void;
}) {
  const columns = useMemo(() => {
    return STATUS_OPTIONS.map((status) => ({
      status,
      ideas: ideas.filter((i) => i.status === status),
    }));
  }, [ideas]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(({ status, ideas: colIdeas }) => (
        <div key={status} className="min-w-[240px] max-w-[280px] flex-shrink-0">
          <div className="mb-3 flex items-center gap-2">
            <Badge className={`text-[10px] capitalize ${statusStyle(status)}`}>
              {status}
            </Badge>
            <span className="text-xs text-muted-foreground">({colIdeas.length})</span>
          </div>
          <div className="space-y-0 rounded-lg bg-muted/50 p-2 min-h-[120px]">
            {colIdeas.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No ideas</p>
            )}
            {colIdeas.map((idea) => (
              <IdeaKanbanCard
                key={idea.id}
                idea={idea}
                onClick={() => onSelectIdea(idea.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ViewMode = "list" | "kanban";

export default function IdeaWorkspacePage() {
  const { data, loading, error } = useQuery<{ userIdeas: UserIdea[] }>(
    GET_USER_IDEAS
  );
  const [createIdea] = useMutation<{ createUserIdea: UserIdea | null }>(CREATE_USER_IDEA, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });
  const [deleteIdea] = useMutation(DELETE_USER_IDEA, {
    refetchQueries: [{ query: GET_USER_IDEAS }],
  });

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const ideas = data?.userIdeas || [];
  const selectedIdea = ideas.find((i) => i.id === selectedId);

  const handleCreate = async (title: string, description: string) => {
    const result = await createIdea({ variables: { title, description } });
    const newId = result.data?.createUserIdea?.id;
    if (newId) {
      setSelectedId(newId);
    }
  };

  const handleDelete = async (id: number) => {
    if (selectedId === id) setSelectedId(null);
    await deleteIdea({ variables: { id } });
  };

  // Show development view if an idea is selected
  if (selectedIdea) {
    return (
      <div className="space-y-6">
        <IdeaDevelopmentView
          key={selectedIdea.id}
          idea={selectedIdea}
          allIdeas={ideas}
          onBack={() => setSelectedId(null)}
          onSelectIdea={(id) => setSelectedId(id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            My Research Ideas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Develop and refine your own research ideas with system-assisted tools
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Idea
        </Button>
      </div>

      {/* Sub-header: back link + view toggle */}
      <div className="flex items-center justify-between">
        <Link
          href="/ideas"
          className="text-sm text-muted-foreground hover:text-blue-600 transition-colors"
        >
          View AI-generated ideas
        </Link>

        {/* View mode toggle (6.6) */}
        {ideas.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-gray-900 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-gray-900 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("kanban")}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Kanban
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Failed to load ideas. Please try again later.</p>
        </div>
      )}

      {loading && <WorkspaceSkeleton />}

      {/* Ideas list */}
      {!loading && ideas.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            No research ideas yet. Click &quot;New Idea&quot; to get started.
          </p>
        </div>
      )}

      {!loading && ideas.length > 0 && viewMode === "list" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {ideas.length} idea{ideas.length !== 1 ? "s" : ""}
          </p>
          {ideas.map((idea) => (
            <IdeaListCard
              key={idea.id}
              idea={idea}
              onSelect={() => setSelectedId(idea.id)}
              onDelete={() => handleDelete(idea.id)}
            />
          ))}
        </div>
      )}

      {!loading && ideas.length > 0 && viewMode === "kanban" && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            {ideas.length} idea{ideas.length !== 1 ? "s" : ""} across {STATUS_OPTIONS.length} stages
          </p>
          <KanbanView ideas={ideas} onSelectIdea={(id) => setSelectedId(id)} />
        </div>
      )}

      {/* Create dialog */}
      <CreateIdeaDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
