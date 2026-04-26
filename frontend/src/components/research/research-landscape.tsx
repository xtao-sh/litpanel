"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, FlaskConical, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LandscapeMethodsCard } from "./landscape-methods-card";
import { LandscapeDatasetsCard } from "./landscape-datasets-card";
import { LandscapeMechanismsCard } from "./landscape-mechanisms-card";
import { LandscapeChinaCard } from "./landscape-china-card";
import { LandscapeGapsCard } from "./landscape-gaps-card";
import { ConsensusCard } from "./consensus-card";
import { SaturationCard } from "./saturation-card";
import { LitReviewModal } from "./lit-review-modal";
import { MethodAdvisor } from "./method-advisor";
import type { ResearchLandscape as ResearchLandscapeType, ResearchPaperItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResearchLandscapeProps {
  landscape: ResearchLandscapeType | null;
  loading: boolean;
  onAtomClick: (slug: string) => void;
  allPaperIds?: string[];
  searchQuery?: string;
  papers?: ResearchPaperItem[];
}

// ---------------------------------------------------------------------------
// Key Authors Card
// ---------------------------------------------------------------------------

function KeyAuthorsCard({ papers }: { papers: ResearchPaperItem[] }) {
  const { t } = useI18n();
  const authorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    papers.forEach((p) => {
      (p.authors || []).forEach((a) => {
        counts[a] = (counts[a] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [papers]);

  if (authorCounts.length === 0) return null;

  return (
    <div className="paper-panel rounded-[1.5rem] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("research.landscape.authorsTitle")}</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {t("research.landscape.authorsScope")}
        </span>
      </div>
      <div className="space-y-1">
        {authorCounts.map(([name, count]) => (
          <Link
            key={name}
            href={`/author/${encodeURIComponent(name)}`}
            className="group -mx-2 flex items-center gap-2 rounded-[0.9rem] px-2 py-1.5 transition-colors hover:bg-[color:oklch(var(--accent)/0.45)]"
          >
            <span className="text-sm text-foreground group-hover:text-primary truncate flex-1 min-w-0">
              {name}
            </span>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary tabular-nums shrink-0">
              {count}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function LandscapeSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="paper-panel rounded-[1.5rem] p-6"
        >
          <Skeleton className="mb-4 h-5 w-48" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResearchLandscapePanel({
  landscape,
  loading,
  onAtomClick,
  allPaperIds = [],
  searchQuery = "",
  papers = [],
}: ResearchLandscapeProps) {
  const { t } = useI18n();
  const [litReviewOpen, setLitReviewOpen] = useState(false);
  const [methodAdvisorOpen, setMethodAdvisorOpen] = useState(false);

  const anchorItems = useMemo(() => {
    const items: { id: string; label: string }[] = [];
    items.push({ id: "landscape-gaps", label: t("research.landscape.anchors.gaps") });
    if (allPaperIds.length > 0 && searchQuery) {
      items.push({ id: "landscape-saturation", label: t("research.landscape.anchors.saturation") });
    }
    items.push({ id: "landscape-methods", label: t("research.landscape.anchors.methods") });
    if (allPaperIds.length > 0 && searchQuery) {
      items.push({ id: "landscape-consensus", label: t("research.landscape.anchors.consensus") });
    }
    items.push({ id: "landscape-datasets", label: t("research.landscape.anchors.datasets") });
    items.push({ id: "landscape-mechanisms", label: t("research.landscape.anchors.mechanisms") });
    if (papers.length > 0) {
      items.push({ id: "landscape-authors", label: t("research.landscape.anchors.authors") });
    }
    items.push({ id: "landscape-china", label: t("research.landscape.anchors.china") });
    return items;
  }, [allPaperIds.length, searchQuery, papers.length, t]);

  if (loading) {
    return <LandscapeSkeleton />;
  }

  if (!landscape) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="paper-panel sticky top-[4.5rem] z-10 rounded-[1.2rem] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">{t("research.landscape.title")}</h2>
            {allPaperIds.length > 0 && (
              <p
                className="text-xs text-muted-foreground"
                title={t("research.landscape.scopeBody", { count: allPaperIds.length.toLocaleString() })}
              >
                {t("research.landscape.scopeInline", { count: allPaperIds.length.toLocaleString() })}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMethodAdvisorOpen(!methodAdvisorOpen)}
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {methodAdvisorOpen ? t("research.landscape.hide") : t("research.landscape.methodAdvisor")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLitReviewOpen(true)}
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
          >
            <FileText className="h-3.5 w-3.5" />
            {t("research.landscape.generateLitReview")}
          </Button>
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {anchorItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-[color:oklch(var(--accent)/0.45)] hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Method Advisor panel */}
      {methodAdvisorOpen && (
        <MethodAdvisor
          initialQuery={searchQuery}
          onClose={() => setMethodAdvisorOpen(false)}
        />
      )}

      {/* Gaps card gets visual prominence at the top */}
      <div id="landscape-gaps">
        <LandscapeGapsCard gaps={landscape.gaps} onAtomClick={onAtomClick} />
      </div>
      {/* Topic saturation — after gaps */}
      {allPaperIds.length > 0 && searchQuery && (
        <div id="landscape-saturation">
          <SaturationCard searchQuery={searchQuery} allPaperIds={allPaperIds} />
        </div>
      )}
      <div id="landscape-methods">
        <LandscapeMethodsCard methods={landscape.methods} onAtomClick={onAtomClick} />
      </div>
      {/* Consensus meter — between methods and datasets */}
      {allPaperIds.length > 0 && searchQuery && (
        <div id="landscape-consensus">
          <ConsensusCard allPaperIds={allPaperIds} searchQuery={searchQuery} />
        </div>
      )}
      <div id="landscape-datasets">
        <LandscapeDatasetsCard datasets={landscape.datasets} onAtomClick={onAtomClick} />
      </div>
      <div id="landscape-mechanisms">
        <LandscapeMechanismsCard mechanisms={landscape.mechanisms} onAtomClick={onAtomClick} />
      </div>
      {papers.length > 0 && (
        <div id="landscape-authors">
          <KeyAuthorsCard papers={papers} />
        </div>
      )}
      <div id="landscape-china">
        <LandscapeChinaCard chinaApplicability={landscape.chinaApplicability} />
      </div>

      {litReviewOpen && (
        <LitReviewModal
          open={litReviewOpen}
          onClose={() => setLitReviewOpen(false)}
          paperIds={allPaperIds}
          initialFocus={searchQuery}
        />
      )}
    </div>
  );
}
