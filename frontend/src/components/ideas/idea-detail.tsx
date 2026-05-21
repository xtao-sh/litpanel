"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, ArrowUpCircle } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IdeaEvaluation } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Verdict badge
// ---------------------------------------------------------------------------

function verdictColor(verdict: string | null): string {
  switch (verdict?.toUpperCase()) {
    case "DEVELOP":
      return "bg-[#f4ead8] text-[#654814] border-[#b88a3b]";
    case "PROMOTE":
      return "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]";
    case "KILL":
      return "bg-[#f4dfd5] text-[#742b14] border-[var(--rust)]";
    default:
      return "bg-[var(--paper-2)] text-[var(--ink-4)] border-[var(--line-soft)]";
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
      ? "bg-[var(--forest)]"
      : displayValue >= 3
        ? "bg-[#2c4870]"
        : displayValue >= 2
          ? "bg-[#b88a3b]"
          : "bg-[var(--ink-4)]/50";

  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-medium text-[var(--ink-4)]">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-2)]">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-[var(--ink)]">
        {value !== null ? `${value}/5` : "--"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next steps checklist
// ---------------------------------------------------------------------------

function NextSteps({ text }: { text: string }) {
  const { t } = useI18n();
  const steps = text
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  if (steps.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--ink)]">{t("ideas.detail.nextSteps")}</h4>
      <ol role="list" className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--ink-4)]">
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--paper-2)] text-xs font-semibold text-[var(--forest)]">
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
        className="inline rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--forest)] hover:bg-[var(--paper-2)]"
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
  const { t } = useI18n();
  return (
    <div className="mt-4 space-y-4 border-t border-[var(--line-soft)] pt-4">
      {/* Verdict + Overall Score */}
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold text-[var(--ink)]">
          {t("ideas.detail.criticEvaluation")}
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
          <span className="text-sm font-semibold text-[var(--ink-4)]">
            {evaluation.overallScore.toFixed(1)}/5
          </span>
        )}
      </div>

      {/* 5-dimension score bars */}
      <Card className="lp-card overflow-hidden border-[var(--line-soft)] shadow-none">
        <CardContent className="space-y-2 pt-4 pb-4 break-words">
          <DimBar label={t("ideas.scores.novelty")} value={evaluation.noveltyScore} />
          <DimBar label={t("ideas.scores.identification")} value={evaluation.identificationScore} />
          <DimBar label={t("ideas.scores.data")} value={evaluation.dataScore} />
          <DimBar label={t("ideas.scores.contribution")} value={evaluation.contributionScore} />
          <DimBar label={t("ideas.scores.feasibility")} value={evaluation.feasibilityScore} />
        </CardContent>
      </Card>

      {/* Key Risk */}
      {evaluation.keyRisk && (
        <Card className="lp-card overflow-hidden border-[#d6b678]/70 bg-[#f4ead8]/60 shadow-none">
          <CardHeader className="flex-row items-start gap-2 pb-1 pt-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#7a5a18]" />
            <h4 className="text-sm font-semibold text-[#654814]">{t("ideas.detail.keyRisk")}</h4>
          </CardHeader>
          <CardContent className="pb-3 pt-0 pl-10">
            <p className="text-sm leading-relaxed text-[#50380f]/80 break-words" style={{ overflowWrap: "anywhere" }}>
              {renderWithPaperLinks(evaluation.keyRisk)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Death reason for KILL verdicts */}
      {evaluation.deathReason && (
        <Card className="lp-card overflow-hidden border-[#da9a80]/70 bg-[#f4dfd5]/60 shadow-none">
          <CardHeader className="flex-row items-start gap-2 pb-1 pt-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8a3318]" />
            <h4 className="text-sm font-semibold text-[#742b14]">{t("ideas.detail.deathReason")}</h4>
          </CardHeader>
          <CardContent className="pb-3 pt-0 pl-10">
            <p className="text-sm leading-relaxed text-[#5c2210]/80 break-words" style={{ overflowWrap: "anywhere" }}>
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
