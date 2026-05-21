"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, GitBranch, HelpCircle, Info, Scale, Wrench } from "lucide-react";

import type { ResearchLandscape } from "@/lib/types";
import {
  buildAtomDetailHref,
  buildExplorerAtomHref,
  buildPaperDetailHref,
  buildProjectGraphHref,
} from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LandscapeGapsCard } from "@/components/research/landscape-gaps-card";

function GapStat({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Card className="rounded-[var(--r)] shadow-[var(--shadow-1)]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--ink-4)]">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold text-[var(--ink)]">{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-4)]">{detail}</p>
      </CardContent>
    </Card>
  );
}

interface ProjectGapsPanelProps {
  landscape: ResearchLandscape | null | undefined;
  slug: string;
  projectTitle: string;
  originQuery?: string | null;
}

export function ProjectGapsPanel({
  landscape,
  slug,
  projectTitle,
  originQuery,
}: ProjectGapsPanelProps) {
  const router = useRouter();

  if (!landscape) {
    return null;
  }

  const { gaps } = landscape;
  const totalSignals =
    gaps.unusedMethods.length +
    gaps.unusedDatasets.length +
    gaps.openQuestions.length +
    gaps.limitations.length;
  const getExplorerHref = (atomSlug: string) =>
    buildExplorerAtomHref({
      atomSlug,
      query: originQuery ?? "",
      returnTo: `/projects/${slug}/gaps`,
    });
  const getAtomDetailHref = (atomSlug: string) =>
    buildAtomDetailHref({
      atomSlug,
      returnTo: `/projects/${slug}/gaps`,
    });
  const getPaperDetailHref = (paperId: string) =>
    buildPaperDetailHref({
      paperId,
      returnTo: `/projects/${slug}/gaps`,
    });

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--r)] border border-[#d6b678] bg-[#f4ead8]/70 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--ink)]">Project Gap Review</p>
              <TooltipProvider delayDuration={180}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-4)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                      aria-label="Gap review help"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs rounded-[var(--r)] border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-xs leading-relaxed text-[var(--ink)] shadow-[var(--shadow-2)]">
                    These signals combine explicit paper limitations and open questions with methods
                    or datasets seen in sibling fields but not yet used inside this project set.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <Link
            href={buildProjectGraphHref({
              paperIds: Array.from(
                new Set([
                  ...gaps.limitations.map((item) => item.paperId),
                  ...gaps.openQuestions.map((item) => item.paperId),
                  ...gaps.unusedMethods.flatMap((atom) => atom.paperIds),
                  ...gaps.unusedDatasets.flatMap((atom) => atom.paperIds),
                ].filter(Boolean))
              ),
              projectSlug: slug,
              projectTitle,
              tab: "gaps",
              label: `${projectTitle} · Gap graph`,
            })}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[#d6b678] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[#7a5a18] transition-colors hover:bg-[#f4ead8]"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Open Gap Graph
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GapStat
          title="Unused Methods"
          value={gaps.unusedMethods.length}
          detail="Methods used in related fields but absent from this project set."
          icon={<Wrench className="h-4 w-4 text-[#8a6d3b]" />}
        />
        <GapStat
          title="Unused Datasets"
          value={gaps.unusedDatasets.length}
          detail="Datasets that may open adjacent identification strategies."
          icon={<AlertTriangle className="h-4 w-4 text-[#8a6d3b]" />}
        />
        <GapStat
          title="Open Questions"
          value={gaps.openQuestions.length}
          detail="Question-shaped prompts extracted from paper limitations."
          icon={<HelpCircle className="h-4 w-4 text-[#8a6d3b]" />}
        />
        <GapStat
          title="Limitations"
          value={gaps.limitations.length}
          detail="Constraint statements already acknowledged in the source papers."
          icon={<Scale className="h-4 w-4 text-[#8a6d3b]" />}
        />
      </div>

      {totalSignals > 0 ? (
        <LandscapeGapsCard
          gaps={gaps}
          onAtomClick={(atomSlug) => router.push(getAtomDetailHref(atomSlug))}
          getExplorerHref={getExplorerHref}
          getPaperHref={getPaperDetailHref}
          actionMode="buttons"
        />
      ) : (
        <Card className="rounded-[var(--r)] border-dashed shadow-[var(--shadow-1)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">No gap signals yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--ink-4)]">
            <p>
              This project currently has no extracted limitations, open questions, or sibling-field
              method/dataset gaps.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
