"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { GET_PAPER_DETAIL, GET_ATOM_DETAIL } from "@/lib/queries";
import { X, ExternalLink } from "lucide-react";
import type { Paper, Atom, Idea } from "@/lib/types";
import { SectionContent } from "@/components/paper/section-content";

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
  if (!item) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 w-full max-w-md border-l border-border bg-background shadow-[-4px_0_12px_rgba(0,0,0,0.05)] transition-transform duration-200 ease-out lg:relative lg:inset-auto lg:z-auto lg:w-[400px] lg:shadow-[-4px_0_12px_rgba(0,0,0,0.05)]"
      style={{ animation: "slideInRight 0.2s ease-out" }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Details</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Paper Detail
// ---------------------------------------------------------------------------

function PaperDetail({ paperId }: { paperId: string }) {
  const { data, loading } = useQuery<PaperDetailResult>(GET_PAPER_DETAIL, {
    variables: { id: paperId },
  });

  if (loading) return <DetailSkeleton />;

  const paper = data?.paper;
  if (!paper) {
    return <p className="text-sm text-gray-500">Paper not found.</p>;
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
        <p className="mt-1 font-mono text-xs text-gray-500">{paper.paperId}</p>
      </div>

      {paper.authors && paper.authors.length > 0 && (
        <div>
          <Label>Authors</Label>
          <p className="text-sm text-gray-700">{paper.authors.join(", ")}</p>
        </div>
      )}

      {paper.year && (
        <div>
          <Label>Year</Label>
          <p className="text-sm text-gray-700">{paper.year}</p>
        </div>
      )}

      {paper.fields && paper.fields.length > 0 && (
        <div>
          <Label>Fields</Label>
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
            <Label>Average Score</Label>
            <p
              className={`text-lg font-semibold tabular-nums ${
                paper.averageScore >= 4
                  ? "text-green-600"
                  : paper.averageScore >= 3
                    ? "text-yellow-600"
                    : "text-gray-500"
              }`}
            >
              {paper.averageScore.toFixed(1)}
            </p>
          </div>
        )}

        {paper.triageDecision && (
          <div>
            <Label>Triage</Label>
            <div className="mt-0.5">
              <Badge
                variant={triageBadgeVariant(paper.triageDecision)}
                className="text-xs"
              >
                {paper.triageDecision}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {paper.scores && paper.scores.length > 0 && (
        <div>
          <Label>Dimension Scores</Label>
          <div className="mt-1 space-y-1">
            {paper.scores.map((s) => (
              <div key={s.dimension} className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-600">{s.dimension}</span>
                <span className="font-medium tabular-nums">{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {paper.hasCard && paper.sections && paper.sections.length > 0 && (
        <div>
          <Label>Research Card</Label>
          <div className="mt-1 space-y-3">
            {paper.sections.slice(0, 3).map((sec) => (
              <div key={sec.section}>
                <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                className="inline-block text-sm text-blue-600 hover:underline"
              >
                View full card ({paper.sections.length} sections)
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
  const { data, loading } = useQuery<AtomDetailResult>(GET_ATOM_DETAIL, {
    variables: { slug },
  });

  if (loading) return <DetailSkeleton />;

  const atom = data?.atom;

  if (!atom) {
    return <p className="text-sm text-gray-500">Atom not found.</p>;
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
          <Badge variant={atomTypeVariant(atom.type)} className="text-xs capitalize">
            {atom.type}
          </Badge>
        </div>
      </div>

      {atom.description && (
        <div>
          <Label>Description</Label>
          <SectionContent content={atom.description} />
        </div>
      )}

      {atom.evidenceStrength && (
        <div>
          <Label>Evidence Strength</Label>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${evidenceBadgeClass(atom.evidenceStrength)}`}
          >
            {atom.evidenceStrength}
          </span>
        </div>
      )}

      {atom.whenToUse && (
        <div>
          <Label>When to Use</Label>
          <SectionContent content={atom.whenToUse} />
        </div>
      )}

      {atom.papers && atom.papers.length > 0 && (
        <div>
          <Label>
            Related Papers ({atom.paperCount})
          </Label>
          <div className="mt-1 space-y-2">
            {atom.papers.slice(0, 10).map((p) => (
              <Link
                key={p.paperId}
                href={`/paper/${p.paperId}`}
                className="block rounded border border-gray-100 p-2 text-sm transition-colors hover:bg-gray-50"
              >
                <span className="text-blue-600">{p.title || p.paperId}</span>
                <div className="mt-0.5 flex gap-3 text-xs text-gray-500">
                  {p.year && <span>{p.year}</span>}
                  {p.averageScore != null && (
                    <span>Score: {p.averageScore.toFixed(1)}</span>
                  )}
                </div>
              </Link>
            ))}
            {atom.papers.length > 10 && (
              <Link
                href={`/atom/${atom.slug}`}
                className="inline-block text-sm text-blue-600 hover:underline"
              >
                View all {atom.paperCount} papers
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
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{idea.title}</h2>
        <p className="mt-1 font-mono text-xs text-gray-500">{idea.id}</p>
      </div>

      {idea.status && (
        <div>
          <Label>Status</Label>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(idea.status)}`}
          >
            {idea.status}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ScoreCell label="Novelty" value={idea.novelty} />
        <ScoreCell label="Feasibility" value={idea.feasibility} />
        <ScoreCell label="Impact" value={idea.impact} />
      </div>

      {idea.composite != null && (
        <div>
          <Label>Composite Score</Label>
          <p className="text-xl font-semibold tabular-nums text-gray-900">
            {idea.composite.toFixed(1)}
          </p>
        </div>
      )}

      {idea.generatedDate && (
        <div>
          <Label>Generated</Label>
          <p className="text-sm text-gray-700">{idea.generatedDate}</p>
        </div>
      )}

      {idea.sourcePapers && idea.sourcePapers.length > 0 && (
        <div>
          <Label>Source Papers</Label>
          <div className="mt-1 space-y-1">
            {idea.sourcePapers.map((pid) => (
              <Link
                key={pid}
                href={`/paper/${pid}`}
                className="block text-sm text-blue-600 hover:underline"
              >
                {pid}
              </Link>
            ))}
          </div>
        </div>
      )}

      {idea.content && (
        <div>
          <Label>Content</Label>
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
    <div className="rounded-lg border border-border p-2.5 text-center">
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
      return "bg-green-100 text-green-800";
    case "moderate":
      return "bg-yellow-100 text-yellow-800";
    case "weak":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-800";
    case "developing":
      return "bg-yellow-100 text-yellow-800";
    case "promoted":
      return "bg-green-100 text-green-800";
    case "killed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
}
