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
import { useI18n } from "@/lib/i18n/locale-context";
import { parsePaperReference } from "@/lib/paper-identifiers";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const IDEA_STATUSES = ["new", "exploring", "developing", "promoted", "killed"] as const;

function statusClassName(status: string | null): string {
  switch (status?.toLowerCase()) {
    case "new":
      return "bg-[#e9eef6] text-[#1b2e4d] border-[#bccbe0]";
    case "exploring":
      return "bg-[#e9eef6] text-[#1b2e4d] border-[#bccbe0]";
    case "developing":
      return "bg-[#f4ead8] text-[#654814] border-[#d6b678]";
    case "promoted":
      return "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]";
    case "killed":
      return "bg-[#f4dfd5] text-[#742b14] border-[#da9a80]";
    default:
      return "";
  }
}

function statusSelectColor(status: string): string {
  switch (status) {
    case "new":
      return "text-[#223a5e]";
    case "exploring":
      return "text-[#223a5e]";
    case "developing":
      return "text-[#7a5a18]";
    case "promoted":
      return "text-[var(--forest-2)]";
    case "killed":
      return "text-[#8a3318]";
    default:
      return "text-[var(--ink)]";
  }
}

function compositeColor(value: number | null): string {
  if (value === null) return "text-[var(--ink-4)] bg-[var(--paper-2)]";
  if (value >= 4) return "text-[var(--forest-2)] bg-[var(--forest-soft)]";
  if (value >= 3) return "text-[#223a5e] bg-[#e9eef6]";
  if (value >= 2) return "text-[#7a5a18] bg-[#f4ead8]";
  return "text-[var(--ink-4)] bg-[var(--paper-2)]";
}

// ---------------------------------------------------------------------------
// Source paper parser: accepts NBER, demo, DOI, arXiv, and uploaded-paper IDs.
// ---------------------------------------------------------------------------

interface SourcePaper {
  id: string;
  description: string | null;
}

function parseSourcePapers(papers: string[]): SourcePaper[] {
  const result: SourcePaper[] = [];
  for (const raw of papers) {
    const parsed = parsePaperReference(raw);
    if (parsed) result.push(parsed);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Plain text extraction (strip markdown markers for preview)
// ---------------------------------------------------------------------------

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "") // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/^[-*]\s+/gm, "") // bullets
    .replace(/^\d+\.\s+/gm, "") // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/`([^`]+)`/g, "$1") // inline code
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
  const { locale, t } = useI18n();
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
        `--- ${t("ideas.card.forkedFrom", { id: idea.id })} ---`,
        `${t("ideas.card.heuristic")}: ${idea.heuristic || 'N/A'}`,
        `${t("ideas.card.originalScores")}: N=${idea.novelty ?? '?'}/5 F=${idea.feasibility ?? '?'}/5 I=${idea.impact ?? '?'}/5 C=${idea.composite?.toFixed(1) ?? '?'}/5`,
        `${t("ideas.card.sourcePapers")}: ${paperIds.length > 0 ? paperIds.join(', ') : t("ideas.card.none")}`,
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
  }, [idea, createUserIdea, addPaperToIdea, router, t]);

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
      return d.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return idea.generatedDate;
    }
  }, [idea.generatedDate, locale]);

  const sourcePapers = useMemo(
    () => parseSourcePapers(idea.sourcePapers),
    [idea.sourcePapers]
  );

  return (
    <Card
      id={`idea-${idea.id}`}
      className="lp-card scroll-mt-24 overflow-hidden rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] shadow-none transition-all duration-200 hover:-translate-y-px"
    >
      {/* Header */}
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-[var(--ink-4)]">{idea.id}</span>
          {idea.status && (
            <Badge
              variant="outline"
              className={statusClassName(idea.status)}
            >
              {t(`ideas.status.${idea.status}`)}
            </Badge>
          )}
          {idea.heuristic && (
            <Badge variant="outline" className="text-xs">
              {idea.heuristic}
            </Badge>
          )}
          {formattedDate && (
            <span className="text-xs text-[var(--ink-4)]">{formattedDate}</span>
          )}
        </div>
        <h3 className="font-display text-[1.25rem] leading-snug text-[var(--ink)] break-words">
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
            <p className="line-clamp-3 text-sm leading-relaxed text-[var(--ink-4)] break-words" style={{ overflowWrap: "anywhere" }}>
              {plainPreview}
            </p>
          )}

          {hasLongContent && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 rounded-full px-2.5 text-xs text-[var(--ink-4)] hover:bg-[var(--paper-2)] hover:text-[var(--forest)]"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  {t("ideas.card.showLess")} <ChevronUp className="ml-1 h-3 w-3" />
                </>
              ) : (
                <>
                  {t("ideas.card.showMore")} <ChevronDown className="ml-1 h-3 w-3" />
                </>
              )}
            </Button>
          )}

          {/* Source papers with descriptions */}
          {sourcePapers.length > 0 && (
            <div className="mt-3 space-y-1">
              <span className="section-kicker">
                {t("ideas.card.sourcePapers")}
              </span>
              <div className="space-y-0.5">
                {sourcePapers.map((sp) => (
                  <div key={sp.id} className="flex items-baseline gap-1.5">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-[var(--forest)]" />
                    <Link
                      href={`/paper/${sp.id}`}
                      className="inline-block break-all rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--forest)] hover:bg-[var(--paper-2)]"
                    >
                      {sp.id}
                    </Link>
                    {sp.description && (
                      <span className="text-xs text-[var(--ink-4)]">
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
      <CardFooter className="flex-col items-stretch gap-2 border-t border-[var(--line-soft)] pt-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <ScoreBar label={t("ideas.scores.novelty")} value={idea.novelty} />
            <ScoreBar label={t("ideas.scores.feasibility")} value={idea.feasibility} />
            <ScoreBar label={t("ideas.scores.impact")} value={idea.impact} />
          </div>
          <div
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--r)] ${compositeColor(idea.composite)}`}
          >
            <span className="text-lg font-bold leading-tight">
              {idea.composite !== null ? idea.composite.toFixed(1) : "--"}
            </span>
            <span className="text-[9px] text-[var(--ink-4)]">/ 5</span>
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-60">
              {t("ideas.scores.score")}
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
                  {t(`ideas.status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Debate button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full border-[#bccbe0] text-xs text-[#223a5e] hover:bg-[#e9eef6]"
            onClick={() => setDebateOpen(true)}
          >
            <Scale className="h-3.5 w-3.5" />
            {t("ideas.card.debate")}
          </Button>

          {/* Fork to workspace button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full border-[var(--forest)] text-xs text-[var(--forest)] hover:bg-[var(--forest-soft)]"
            disabled={forking}
            onClick={handleForkToWorkspace}
          >
            <PenTool className="h-3.5 w-3.5" />
            {forking ? t("ideas.card.creating") : t("ideas.card.workOnThis")}
          </Button>
        </div>

        {/* Critic Evaluation (when expanded and available) */}
        {expanded && idea.evaluation && (
          <IdeaDetail evaluation={idea.evaluation} />
        )}

        {/* Show expand hint if evaluation exists but card is collapsed */}
        {!expanded && idea.evaluation && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ink-4)]">
            <span className={`inline-block h-2 w-2 rounded-full ${
              idea.evaluation.verdict === "PROMOTE"
                ? "bg-[var(--forest)]"
                : idea.evaluation.verdict === "KILL"
                  ? "bg-[var(--rust)]"
                  : "bg-[#b88a3b]"
            }`} />
            {t("ideas.card.criticAvailable")}
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
