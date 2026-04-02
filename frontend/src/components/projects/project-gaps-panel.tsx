"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, GitBranch, HelpCircle, Scale, Wrench } from "lucide-react";

import type { ResearchLandscape } from "@/lib/types";
import {
  buildAtomDetailHref,
  buildExplorerAtomHref,
  buildPaperDetailHref,
  buildProjectGraphHref,
} from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
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
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Project Gap Review</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              These signals combine explicit paper limitations and open questions with methods or
              datasets seen in sibling fields but not yet used inside this project set.
            </p>
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
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
          icon={<Wrench className="h-4 w-4 text-amber-500" />}
        />
        <GapStat
          title="Unused Datasets"
          value={gaps.unusedDatasets.length}
          detail="Datasets that may open adjacent identification strategies."
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        />
        <GapStat
          title="Open Questions"
          value={gaps.openQuestions.length}
          detail="Question-shaped prompts extracted from paper limitations."
          icon={<HelpCircle className="h-4 w-4 text-amber-500" />}
        />
        <GapStat
          title="Limitations"
          value={gaps.limitations.length}
          detail="Constraint statements already acknowledged in the source papers."
          icon={<Scale className="h-4 w-4 text-amber-500" />}
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
        <Card className="rounded-xl border-dashed shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">No gap signals yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This project currently has no extracted limitations, open questions, or sibling-field
              method/dataset gaps.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How to use this page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Start with the unexplored methods and available datasets if you want the most actionable
            extension paths.
          </p>
          <p>
            Then use the open questions and limitations to decide whether the next step is more
            identification, more data, or a narrower claim.
          </p>
          <Link
            href={`/projects/${slug}/methods`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Inspect methods and data coverage
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
