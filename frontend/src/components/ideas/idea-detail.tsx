"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, ArrowUpCircle } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IdeaEvaluation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Verdict badge
// ---------------------------------------------------------------------------

function verdictColor(verdict: string | null): string {
  switch (verdict?.toUpperCase()) {
    case "DEVELOP":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "PROMOTE":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "KILL":
      return "bg-rose-100 text-rose-800 border-rose-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function VerdictIcon({ verdict }: { verdict: string | null }) {
  switch (verdict?.toUpperCase()) {
    case "DEVELOP":
      return <ArrowUpCircle className="h-4 w-4" />;
    case "PROMOTE":
      return <CheckCircle2 className="h-4 w-4" />;
    case "KILL":
      return <XCircle className="h-4 w-4" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluation dimension score bar
// ---------------------------------------------------------------------------

interface DimBarProps {
  label: string;
  value: number | null;
}

function DimBar({ label, value }: DimBarProps) {
  const displayValue = value ?? 0;
  const pct = Math.min((displayValue / 5) * 100, 100);

  const barColor =
    displayValue >= 4
      ? "bg-emerald-500"
      : displayValue >= 3
        ? "bg-sky-500"
        : displayValue >= 2
          ? "bg-amber-500"
          : "bg-muted-foreground/50";

  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-foreground">
        {value !== null ? `${value}/5` : "--"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next steps checklist
// ---------------------------------------------------------------------------

function NextSteps({ text }: { text: string }) {
  const steps = text
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  if (steps.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">Next Steps</h4>
      <ol role="list" className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/70 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span className="leading-relaxed break-words" style={{ overflowWrap: "anywhere" }}>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline paper link rendering
// ---------------------------------------------------------------------------

const PAPER_ID_RE = /\b(w\d{4,5})\b/g;

function renderWithPaperLinks(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PAPER_ID_RE.lastIndex = 0;
  while ((match = PAPER_ID_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <Link
        key={`paper-${match.index}`}
        href={`/paper/${match[1]}`}
        className="inline rounded-full border border-border/70 bg-accent/55 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary hover:bg-accent/80"
      >
        {match[1]}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface IdeaDetailProps {
  evaluation: IdeaEvaluation;
}

export function IdeaDetail({ evaluation }: IdeaDetailProps) {
  return (
    <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
      {/* Verdict + Overall Score */}
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold text-foreground">
          Critic Evaluation
        </h4>
        {evaluation.verdict && (
          <Badge
            variant="outline"
            className={`gap-1 ${verdictColor(evaluation.verdict)}`}
          >
            <VerdictIcon verdict={evaluation.verdict} />
            {evaluation.verdict}
          </Badge>
        )}
        {evaluation.overallScore != null && (
          <span className="text-sm font-semibold text-muted-foreground">
            {evaluation.overallScore.toFixed(1)}/5
          </span>
        )}
      </div>

      {/* 5-dimension score bars */}
      <Card className="paper-panel overflow-hidden border-border/70 shadow-none">
        <CardContent className="space-y-2 pt-4 pb-4 break-words">
          <DimBar label="Novelty" value={evaluation.noveltyScore} />
          <DimBar label="Identification" value={evaluation.identificationScore} />
          <DimBar label="Data" value={evaluation.dataScore} />
          <DimBar label="Contribution" value={evaluation.contributionScore} />
          <DimBar label="Feasibility" value={evaluation.feasibilityScore} />
        </CardContent>
      </Card>

      {/* Key Risk */}
      {evaluation.keyRisk && (
        <Card className="paper-panel overflow-hidden border-amber-200/70 bg-amber-50/60 shadow-none">
          <CardHeader className="flex-row items-start gap-2 pb-1 pt-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <h4 className="text-sm font-semibold text-amber-800">Key Risk</h4>
          </CardHeader>
          <CardContent className="pb-3 pt-0 pl-10">
            <p className="text-sm leading-relaxed text-amber-900/80 break-words" style={{ overflowWrap: "anywhere" }}>
              {renderWithPaperLinks(evaluation.keyRisk)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Death reason for KILL verdicts */}
      {evaluation.deathReason && (
        <Card className="paper-panel overflow-hidden border-rose-200/70 bg-rose-50/60 shadow-none">
          <CardHeader className="flex-row items-start gap-2 pb-1 pt-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <h4 className="text-sm font-semibold text-red-800">Death Reason</h4>
          </CardHeader>
          <CardContent className="pb-3 pt-0 pl-10">
            <p className="text-sm leading-relaxed text-red-900/80 break-words" style={{ overflowWrap: "anywhere" }}>
              {renderWithPaperLinks(evaluation.deathReason)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      {evaluation.nextSteps && <NextSteps text={evaluation.nextSteps} />}
    </div>
  );
}
