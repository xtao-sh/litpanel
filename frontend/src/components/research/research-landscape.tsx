"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, FlaskConical, GitBranch, MessageSquare, Users } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResearchLandscapeProps {
  landscape: ResearchLandscapeType | null;
  loading: boolean;
  onAtomClick: (slug: string) => void;
  allPaperIds?: string[];
  searchQuery?: string;
  graphHref?: string;
  papers?: ResearchPaperItem[];
}

// ---------------------------------------------------------------------------
// Key Authors Card
// ---------------------------------------------------------------------------

function KeyAuthorsCard({ papers }: { papers: ResearchPaperItem[] }) {
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
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-foreground">Visible Authors</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          from current results page
        </span>
      </div>
      <div className="space-y-1">
        {authorCounts.map(([name, count]) => (
          <Link
            key={name}
            href={`/author/${encodeURIComponent(name)}`}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-indigo-50/60"
          >
            <span className="text-sm text-foreground group-hover:text-indigo-700 truncate flex-1 min-w-0">
              {name}
            </span>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-semibold text-indigo-700 tabular-nums shrink-0">
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
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
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
  graphHref,
  papers = [],
}: ResearchLandscapeProps) {
  const [litReviewOpen, setLitReviewOpen] = useState(false);
  const [methodAdvisorOpen, setMethodAdvisorOpen] = useState(false);

  const anchorItems = useMemo(() => {
    const items: { id: string; label: string }[] = [];
    items.push({ id: "landscape-gaps", label: "Gaps" });
    if (allPaperIds.length > 0 && searchQuery) {
      items.push({ id: "landscape-saturation", label: "Saturation" });
    }
    items.push({ id: "landscape-methods", label: "Methods" });
    if (allPaperIds.length > 0 && searchQuery) {
      items.push({ id: "landscape-consensus", label: "Consensus" });
    }
    items.push({ id: "landscape-datasets", label: "Datasets" });
    items.push({ id: "landscape-mechanisms", label: "Mechanisms" });
    if (papers.length > 0) {
      items.push({ id: "landscape-authors", label: "Authors" });
    }
    items.push({ id: "landscape-china", label: "China" });
    return items;
  }, [allPaperIds.length, searchQuery, papers.length]);

  if (loading) {
    return <LandscapeSkeleton />;
  }

  if (!landscape) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Section anchor nav */}
      <nav className="flex gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-border">
        {anchorItems.map(item => (
          <button
            key={item.id}
            onClick={() => {
              document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {allPaperIds.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Landscape scope
          </p>
          <p className="mt-1 leading-relaxed">
            This panel summarizes the <span className="font-medium text-foreground">{allPaperIds.length.toLocaleString()}</span> paper
            {allPaperIds.length !== 1 ? "s" : ""} in the current Research query. Method, dataset,
            and mechanism counts are based on linked atoms attached to those papers. Gap items combine
            explicit paper limitations and open questions with methods or datasets that appear in related
            fields but not in this matched set.
          </p>
        </div>
      )}

      {/* Action buttons */}
      {allPaperIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Cross-page navigation */}
          {searchQuery && (
            <>
              <Link href={graphHref ?? `/graph?q=${encodeURIComponent(searchQuery)}`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <GitBranch className="h-3.5 w-3.5" />
                  View Research Graph
                </Button>
              </Link>
              <Link href={`/ask?q=${encodeURIComponent(searchQuery)}`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ask AI
                </Button>
              </Link>
            </>
          )}
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMethodAdvisorOpen(!methodAdvisorOpen)}
            className="gap-1.5 text-xs"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {methodAdvisorOpen ? "Hide" : "Method"} Advisor
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLitReviewOpen(true)}
            className="gap-1.5 text-xs"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Lit Review
          </Button>
        </div>
      )}

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
