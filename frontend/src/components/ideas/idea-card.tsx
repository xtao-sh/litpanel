"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { ChevronDown, ChevronUp, Scale, FileText, PenTool } from "lucide-react";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScoreBar } from "@/components/ideas/score-bar";
import { IdeaDetail } from "@/components/ideas/idea-detail";
import { DebateModal } from "@/components/ideas/debate-modal";
import { SectionContent } from "@/components/paper/section-content";
import { SET_IDEA_STATUS, GET_IDEAS, CREATE_USER_IDEA, GET_USER_IDEAS, ADD_PAPER_TO_IDEA } from "@/lib/queries";
import type { Idea, UserIdea } from "@/lib/types";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const IDEA_STATUSES = ["new", "exploring", "developing", "promoted", "killed"] as const;

function statusClassName(status: string | null): string {
  switch (status?.toLowerCase()) {
    case "new":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "exploring":
      return "bg-violet-100 text-violet-800 border-violet-200";
    case "developing":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "promoted":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "killed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "";
  }
}

function statusSelectColor(status: string): string {
  switch (status) {
    case "new":
      return "text-sky-700";
    case "exploring":
      return "text-violet-700";
    case "developing":
      return "text-amber-700";
    case "promoted":
      return "text-emerald-700";
    case "killed":
      return "text-rose-700";
    default:
      return "text-foreground";
  }
}

function compositeColor(value: number | null): string {
  if (value === null) return "text-muted-foreground bg-muted";
  if (value >= 4) return "text-emerald-700 bg-emerald-50";
  if (value >= 3) return "text-sky-700 bg-sky-50";
  if (value >= 2) return "text-amber-700 bg-amber-50";
  return "text-muted-foreground bg-muted";
}

// ---------------------------------------------------------------------------
// Source paper parser: extract wXXXXX (description) pairs
// ---------------------------------------------------------------------------

interface SourcePaper {
  id: string;
  description: string | null;
}

function parseSourcePapers(papers: string[]): SourcePaper[] {
  const result: SourcePaper[] = [];
  for (const raw of papers) {
    // Match pattern: wXXXXX (description) or just wXXXXX
    const match = raw.match(/^(w\d{4,5})\s*(?:\(([^)]+)\))?/);
    if (match) {
      result.push({
        id: match[1],
        description: match[2] ? match[2].trim() : null,
      });
    } else {
      // Might just be a bare paper ID
      const bare = raw.match(/(w\d{4,5})/);
      if (bare) {
        result.push({ id: bare[1], description: null });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plain text extraction (strip markdown markers for preview)
// ---------------------------------------------------------------------------

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")          // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
    .replace(/\*([^*]+)\*/g, "$1")        // italic
    .replace(/^[-*]\s+/gm, "")           // bullets
    .replace(/^\d+\.\s+/gm, "")          // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/`([^`]+)`/g, "$1")          // inline code
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IdeaCardProps {
  idea: Idea;
}

export function IdeaCard({ idea }: IdeaCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [debateOpen, setDebateOpen] = useState(false);
  const [forking, setForking] = useState(false);

  const [setIdeaStatus] = useMutation(SET_IDEA_STATUS, {
    refetchQueries: [{ query: GET_IDEAS }],
  });

  const [createUserIdea] = useMutation<{ createUserIdea: UserIdea | null }>(
    CREATE_USER_IDEA,
    { refetchQueries: [{ query: GET_USER_IDEAS }] }
  );

  const [addPaperToIdea] = useMutation(ADD_PAPER_TO_IDEA);

  const handleForkToWorkspace = useCallback(async () => {
    setForking(true);
    try {
      // Extract paper IDs from sourcePapers
      const paperIds = (idea.sourcePapers || [])
        .flatMap(sp => sp.match(/w\d{4,5}/g) || []);

      const description = [
        idea.content || '',
        '',
        `--- Forked from ${idea.id} ---`,
        `Heuristic: ${idea.heuristic || 'N/A'}`,
        `Original scores: N=${idea.novelty ?? '?'}/5 F=${idea.feasibility ?? '?'}/5 I=${idea.impact ?? '?'}/5 C=${idea.composite?.toFixed(1) ?? '?'}/5`,
        `Source papers: ${paperIds.length > 0 ? paperIds.join(', ') : 'none'}`,
      ].join('\n');

      const result = await createUserIdea({
        variables: {
          title: idea.title,
          description,
        },
      });

      // If we got the new idea's ID, also add the source papers
      const newIdeaId = result.data?.createUserIdea?.id;
      if (newIdeaId && paperIds.length > 0) {
        for (const pid of paperIds.slice(0, 10)) {
          await addPaperToIdea({ variables: { ideaId: newIdeaId, paperId: pid } });
        }
      }

      router.push("/ideas/workspace");
    } catch {
      // If creation fails, just stay on the page
      setForking(false);
    }
  }, [idea, createUserIdea, addPaperToIdea, router]);

  const handleStatusChange = useCallback(
    (newStatus: string) => {
      setIdeaStatus({
        variables: { ideaId: idea.id, status: newStatus },
        optimisticResponse: { setIdeaStatus: true },
      });
    },
    [idea.id, setIdeaStatus]
  );

  const plainPreview = useMemo(() => {
    if (!idea.content) return null;
    const plain = stripMarkdown(idea.content);
    if (plain.length <= 200) return plain;
    return plain.slice(0, 200) + "...";
  }, [idea.content]);

  const hasLongContent =
    idea.content !== null && idea.content.length > 200;

  const formattedDate = useMemo(() => {
    if (!idea.generatedDate) return null;
    try {
      const d = new Date(idea.generatedDate);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return idea.generatedDate;
    }
  }, [idea.generatedDate]);

  const sourcePapers = useMemo(
    () => parseSourcePapers(idea.sourcePapers),
    [idea.sourcePapers]
  );

  return (
    <Card className="paper-panel overflow-hidden rounded-[1.45rem] border border-border/75 bg-background/92 shadow-none transition-all duration-200 hover:-translate-y-px">
      {/* Header */}
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{idea.id}</span>
          {idea.status && (
            <Badge
              variant="outline"
              className={statusClassName(idea.status)}
            >
              {idea.status}
            </Badge>
          )}
          {idea.heuristic && (
            <Badge variant="outline" className="text-xs">
              {idea.heuristic}
            </Badge>
          )}
          {formattedDate && (
            <span className="text-xs text-muted-foreground">{formattedDate}</span>
          )}
        </div>
        <h3 className="font-display text-[1.25rem] leading-snug text-foreground break-words">
          {idea.title}
        </h3>
      </CardHeader>

      {/* Content */}
      {idea.content && (
        <CardContent className="max-w-full overflow-hidden pb-3">
          {expanded ? (
            <div className="overflow-x-auto break-words" style={{ overflowWrap: "anywhere" }}>
              <SectionContent content={idea.content} />
            </div>
          ) : (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground break-words" style={{ overflowWrap: "anywhere" }}>
              {plainPreview}
            </p>
          )}

          {hasLongContent && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-primary"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="ml-1 h-3 w-3" />
                </>
              ) : (
                <>
                  Show more <ChevronDown className="ml-1 h-3 w-3" />
                </>
              )}
            </Button>
          )}

          {/* Source papers with descriptions */}
          {sourcePapers.length > 0 && (
            <div className="mt-3 space-y-1">
              <span className="section-kicker">
                Source Papers
              </span>
              <div className="space-y-0.5">
                {sourcePapers.map((sp) => (
                  <div key={sp.id} className="flex items-baseline gap-1.5">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-primary/45" />
                    <Link
                      href={`/paper/${sp.id}`}
                      className="inline-block break-all rounded-full border border-border/70 bg-accent/55 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary hover:bg-accent/80"
                    >
                      {sp.id}
                    </Link>
                    {sp.description && (
                      <span className="text-xs text-muted-foreground">
                        {sp.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}

      {/* Footer: Scores + Actions */}
      <CardFooter className="flex-col items-stretch gap-2 border-t border-border/70 pt-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <ScoreBar label="Novelty" value={idea.novelty} />
            <ScoreBar label="Feasibility" value={idea.feasibility} />
            <ScoreBar label="Impact" value={idea.impact} />
          </div>
          <div
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg ${compositeColor(idea.composite)}`}
          >
            <span className="text-lg font-bold leading-tight">
              {idea.composite !== null ? idea.composite.toFixed(1) : "--"}
            </span>
            <span className="text-[9px] text-muted-foreground">/ 5</span>
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-60">
              Score
            </span>
          </div>
        </div>

        {/* Actions row */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {/* Status dropdown */}
          <Select
            value={idea.status?.toLowerCase() ?? "new"}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className={`h-7 w-[130px] text-xs ${statusSelectColor(idea.status?.toLowerCase() ?? "new")}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDEA_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className={`text-xs capitalize ${statusSelectColor(s)}`}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Debate button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full border-violet-200 text-xs text-violet-700 hover:bg-violet-50"
            onClick={() => setDebateOpen(true)}
          >
            <Scale className="h-3.5 w-3.5" />
            Debate
          </Button>

          {/* Fork to workspace button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full border-primary/20 text-xs text-primary hover:bg-primary/10"
            disabled={forking}
            onClick={handleForkToWorkspace}
          >
            <PenTool className="h-3.5 w-3.5" />
            {forking ? "Creating..." : "Work on This"}
          </Button>
        </div>

        {/* Critic Evaluation (when expanded and available) */}
        {expanded && idea.evaluation && (
          <IdeaDetail evaluation={idea.evaluation} />
        )}

        {/* Show expand hint if evaluation exists but card is collapsed */}
        {!expanded && idea.evaluation && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`inline-block h-2 w-2 rounded-full ${
              idea.evaluation.verdict === "PROMOTE"
                ? "bg-emerald-400"
                : idea.evaluation.verdict === "KILL"
                  ? "bg-rose-400"
                  : "bg-amber-400"
            }`} />
            Critic evaluation available
          </div>
        )}
      </CardFooter>

      {/* Debate modal */}
      <DebateModal
        open={debateOpen}
        onClose={() => setDebateOpen(false)}
        ideaTitle={idea.title}
        ideaText={idea.content ?? ""}
        paperIds={idea.sourcePapers}
      />
    </Card>
  );
}
