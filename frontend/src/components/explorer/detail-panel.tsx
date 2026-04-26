"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { GET_PAPER_DETAIL, GET_ATOM_DETAIL } from "@/lib/queries";
import { X, ExternalLink } from "lucide-react";
import type { Paper, Atom, Idea } from "@/lib/types";
import { SectionContent } from "@/components/paper/section-content";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Query result types
// ---------------------------------------------------------------------------

interface PaperDetailResult {
  paper: Paper | null;
}

interface AtomDetailResult {
  atom:
    | (Atom & {
        papers?: Array<{
          paperId: string;
          title: string | null;
          year: number | null;
          averageScore: number | null;
          fields: string[];
        }>;
      })
    | null;
}

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

type DetailItem =
  | { type: "paper"; id: string }
  | { type: "atom"; slug: string }
  | { type: "idea"; data: Idea };

interface DetailPanelProps {
  item: DetailItem | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function DetailPanel({ item, onClose }: DetailPanelProps) {
  const { t } = useI18n();
  // Close on Escape key
  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 w-full max-w-md border-l border-border/70 bg-background/95 shadow-[-12px_0_36px_rgba(44,51,71,0.12)] backdrop-blur-sm transition-transform duration-200 ease-out lg:relative lg:inset-auto lg:z-auto lg:w-[400px] lg:shadow-[-12px_0_36px_rgba(44,51,71,0.08)]"
      style={{ animation: "slideInRight 0.2s ease-out" }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="section-kicker">{t("explorer.detail.kicker")}</p>
            <h3 className="font-display text-2xl tracking-tight text-foreground">{t("explorer.detail.title")}</h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {item.type === "paper" && <PaperDetail paperId={item.id} />}
            {item.type === "atom" && <AtomDetail slug={item.slug} />}
            {item.type === "idea" && <IdeaDetail idea={item.data} />}
          </div>
        </ScrollArea>

        <div className="border-t border-border/50 px-4 py-2 text-center">
          <span className="text-[10px] text-muted-foreground">{t("explorer.detail.escToClose")}</span>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Paper Detail
// ---------------------------------------------------------------------------

function PaperDetail({ paperId }: { paperId: string }) {
  const { t } = useI18n();
  const { data, loading } = useQuery<PaperDetailResult>(GET_PAPER_DETAIL, {
    variables: { id: paperId },
  });

  if (loading) return <DetailSkeleton />;

  const paper = data?.paper;
  if (!paper) {
    return <p className="text-sm text-muted-foreground">{t("explorer.detail.paperNotFound")}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/paper/${paper.paperId}`}
          className="group flex items-center gap-1.5 text-lg font-semibold text-foreground hover:text-primary"
        >
          {paper.title || paper.paperId}
          <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{paper.paperId}</p>
      </div>

      {paper.authors && paper.authors.length > 0 && (
        <div>
          <Label>{t("explorer.detail.authors")}</Label>
          <p className="text-sm text-muted-foreground">{paper.authors.join(", ")}</p>
        </div>
      )}

      {paper.year && (
        <div>
          <Label>{t("explorer.detail.year")}</Label>
          <p className="text-sm text-muted-foreground">{paper.year}</p>
        </div>
      )}

      {paper.fields && paper.fields.length > 0 && (
        <div>
          <Label>{t("explorer.detail.fields")}</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {paper.fields.map((f) => (
              <Badge key={f} variant="paper" className="text-xs">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {paper.averageScore != null && (
          <div>
            <Label>{t("explorer.detail.averageScore")}</Label>
            <p
              className={`text-lg font-semibold tabular-nums ${
                paper.averageScore >= 4
                  ? "text-green-600"
                  : paper.averageScore >= 3
                    ? "text-yellow-600"
                    : "text-muted-foreground"
              }`}
            >
              {paper.averageScore.toFixed(1)}
            </p>
          </div>
        )}

        {paper.triageDecision && (
          <div>
            <Label>{t("explorer.detail.triage")}</Label>
            <div className="mt-0.5">
              <Badge
                variant={triageBadgeVariant(paper.triageDecision)}
                className="text-xs"
              >
                {paper.triageDecision === "DEEP_READ"
                  ? t("explorer.values.deepRead")
                  : paper.triageDecision === "SKIM"
                    ? t("explorer.values.skim")
                    : paper.triageDecision === "SKIP"
                      ? t("explorer.values.skip")
                      : paper.triageDecision}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {paper.scores && paper.scores.length > 0 && (
        <div>
          <Label>{t("explorer.detail.dimensionScores")}</Label>
          <div className="mt-1 space-y-1">
            {paper.scores.map((s) => (
              <div key={s.dimension} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{s.dimension}</span>
                <span className="font-medium tabular-nums">{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {paper.hasCard && paper.sections && paper.sections.length > 0 && (
        <div>
          <Label>{t("explorer.detail.researchCard")}</Label>
          <div className="mt-1 space-y-3">
            {paper.sections.slice(0, 3).map((sec) => (
              <div key={sec.section}>
                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {sec.section.replace(/_/g, " ")}
                </h5>
                <div className="mt-0.5">
                  <SectionContent
                    content={
                      sec.content.length > 500
                        ? sec.content.slice(0, 500) + "..."
                        : sec.content
                    }
                  />
                </div>
              </div>
            ))}
            {paper.sections.length > 3 && (
              <Link
                href={`/paper/${paper.paperId}`}
                className="inline-block text-sm text-primary hover:underline"
              >
                {t("explorer.actions.viewFullCard", { count: paper.sections.length })}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atom Detail
// ---------------------------------------------------------------------------

function AtomDetail({ slug }: { slug: string }) {
  const { t } = useI18n();
  const { data, loading } = useQuery<AtomDetailResult>(GET_ATOM_DETAIL, {
    variables: { slug },
  });

  if (loading) return <DetailSkeleton />;

  const atom = data?.atom;

  if (!atom) {
    return <p className="text-sm text-muted-foreground">{t("explorer.detail.atomNotFound")}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/atom/${atom.slug}`}
          className="group flex items-center gap-1.5 text-lg font-semibold text-foreground hover:text-primary"
        >
          {atom.title}
          <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        <div className="mt-1.5">
          <Badge variant={atomTypeVariant(atom.type)} className="text-xs">
            {t(`explorer.values.${atom.type}`)}
          </Badge>
        </div>
      </div>

      {atom.description && (
        <div>
          <Label>{t("explorer.detail.description")}</Label>
          <SectionContent content={atom.description} />
        </div>
      )}

      {atom.evidenceStrength && (
        <div>
          <Label>{t("explorer.detail.evidenceStrength")}</Label>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${evidenceBadgeClass(atom.evidenceStrength)}`}
          >
            {t(`explorer.values.${atom.evidenceStrength}`)}
          </span>
        </div>
      )}

      {atom.whenToUse && (
        <div>
          <Label>{t("explorer.detail.whenToUse")}</Label>
          <SectionContent content={atom.whenToUse} />
        </div>
      )}

      {atom.papers && atom.papers.length > 0 && (
        <div>
          <Label>
            {t("explorer.detail.relatedPapers", { count: atom.paperCount })}
          </Label>
          <div className="mt-1 space-y-2">
            {atom.papers.slice(0, 10).map((p) => (
              <Link
                key={p.paperId}
                href={`/paper/${p.paperId}`}
                className="block rounded border border-border p-2 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="text-primary">{p.title || p.paperId}</span>
                <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                  {p.year && <span>{p.year}</span>}
                  {p.averageScore != null && (
                    <span>{t("explorer.detail.score", { score: p.averageScore.toFixed(1) })}</span>
                  )}
                </div>
              </Link>
            ))}
            {atom.papers.length > 10 && (
              <Link
                href={`/atom/${atom.slug}`}
                className="inline-block text-sm text-primary hover:underline"
              >
                {t("explorer.actions.viewAllPapers", { count: atom.paperCount })}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idea Detail
// ---------------------------------------------------------------------------

function IdeaDetail({ idea }: { idea: Idea }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{idea.title}</h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{idea.id}</p>
      </div>

      {idea.status && (
        <div>
          <Label>{t("explorer.detail.status")}</Label>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(idea.status)}`}
          >
            {t(`explorer.values.${idea.status}`)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ScoreCell label={t("explorer.detail.novelty")} value={idea.novelty} />
        <ScoreCell label={t("explorer.detail.feasibility")} value={idea.feasibility} />
        <ScoreCell label={t("explorer.detail.impact")} value={idea.impact} />
      </div>

      {idea.composite != null && (
        <div>
          <Label>{t("explorer.detail.compositeScore")}</Label>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {idea.composite.toFixed(1)}
          </p>
        </div>
      )}

      {idea.generatedDate && (
        <div>
          <Label>{t("explorer.detail.generated")}</Label>
          <p className="text-sm text-muted-foreground">{idea.generatedDate}</p>
        </div>
      )}

      {idea.sourcePapers && idea.sourcePapers.length > 0 && (
        <div>
          <Label>{t("explorer.detail.sourcePapers")}</Label>
          <div className="mt-1 space-y-1">
            {idea.sourcePapers.map((pid) => (
              <Link
                key={pid}
                href={`/paper/${pid}`}
                className="block text-sm text-primary hover:underline"
              >
                {pid}
              </Link>
            ))}
          </div>
        </div>
      )}

      {idea.content && (
        <div>
          <Label>{t("explorer.detail.content")}</Label>
          <SectionContent content={idea.content} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

function ScoreCell({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/75 p-2.5 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">
        {value ?? "-"}
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge helpers (duplicated from tables for self-containment)
// ---------------------------------------------------------------------------

function triageBadgeVariant(
  decision: string | null
): BadgeProps["variant"] {
  switch (decision) {
    case "DEEP_READ":
      return "method";
    case "SKIM":
      return "mechanism";
    default:
      return "secondary";
  }
}

function atomTypeVariant(type: string): BadgeProps["variant"] {
  switch (type) {
    case "mechanism":
      return "mechanism";
    case "method":
      return "method";
    case "dataset":
      return "dataset";
    case "puzzle":
      return "puzzle";
    default:
      return "secondary";
  }
}

function evidenceBadgeClass(strength: string | null): string {
  switch (strength) {
    case "strong":
      return "bg-emerald-100 text-emerald-800";
    case "moderate":
      return "bg-amber-100 text-amber-800";
    case "weak":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case "new":
      return "bg-sky-100 text-sky-800";
    case "developing":
      return "bg-amber-100 text-amber-800";
    case "promoted":
      return "bg-emerald-100 text-emerald-800";
    case "killed":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}
