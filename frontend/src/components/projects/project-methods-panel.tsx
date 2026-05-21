"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Database, FlaskConical, GitBranch, GitBranchPlus, Layers3 } from "lucide-react";

import type { ResearchLandscape } from "@/lib/types";
import {
  buildAtomDetailHref,
  buildExplorerAtomHref,
  buildProjectGraphHref,
} from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LandscapeMethodsCard } from "@/components/research/landscape-methods-card";
import { LandscapeDatasetsCard } from "@/components/research/landscape-datasets-card";
import { LandscapeMechanismsCard } from "@/components/research/landscape-mechanisms-card";
import { LandscapeChinaCard } from "@/components/research/landscape-china-card";

function SummaryCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
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

interface ProjectMethodsPanelProps {
  landscape: ResearchLandscape | null | undefined;
  paperCount: number;
  projectSlug: string;
  projectTitle: string;
  originQuery?: string | null;
}

export function ProjectMethodsPanel({
  landscape,
  paperCount,
  projectSlug,
  projectTitle,
  originQuery,
}: ProjectMethodsPanelProps) {
  const router = useRouter();

  if (!landscape) {
    return null;
  }

  const mappedMethodPapers = new Set(landscape.methods.flatMap((atom) => atom.paperIds)).size;
  const mappedDatasetPapers = new Set(landscape.datasets.flatMap((atom) => atom.paperIds)).size;
  const mappedMechanismPapers = new Set(landscape.mechanisms.flatMap((atom) => atom.paperIds)).size;
  const getExplorerHref = (atomSlug: string) =>
    buildExplorerAtomHref({
      atomSlug,
      query: originQuery ?? "",
      returnTo: `/projects/${projectSlug}/methods`,
    });
  const getAtomDetailHref = (atomSlug: string) =>
    buildAtomDetailHref({
      atomSlug,
      returnTo: `/projects/${projectSlug}/methods`,
    });

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper-2)]/20 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">Methods, Data, and Mechanisms</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink-4)]">
              This page focuses on repeated empirical strategies and evidence inputs across the{" "}
              {paperCount.toLocaleString()} paper{paperCount !== 1 ? "s" : ""} in the current project.
            </p>
          </div>
          <Link
            href={buildProjectGraphHref({
              paperIds: Array.from(
                new Set([
                  ...landscape.methods.flatMap((atom) => atom.paperIds),
                  ...landscape.datasets.flatMap((atom) => atom.paperIds),
                  ...landscape.mechanisms.flatMap((atom) => atom.paperIds),
                ])
              ),
              projectSlug,
              projectTitle,
              tab: "methods",
              label: `${projectTitle} · Methods graph`,
            })}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] px-3 py-2 text-sm font-medium text-[#223a5e] transition-colors hover:bg-[#e9eef6]"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Open Methods Graph
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Methods"
          value={String(landscape.methods.length)}
          detail={`${mappedMethodPapers} paper${mappedMethodPapers !== 1 ? "s" : ""} map to at least one method atom.`}
          icon={<FlaskConical className="h-4 w-4 text-[var(--forest)]" />}
        />
        <SummaryCard
          title="Datasets"
          value={String(landscape.datasets.length)}
          detail={`${mappedDatasetPapers} paper${mappedDatasetPapers !== 1 ? "s" : ""} map to a dataset atom.`}
          icon={<Database className="h-4 w-4 text-[#2c4870]" />}
        />
        <SummaryCard
          title="Mechanisms"
          value={String(landscape.mechanisms.length)}
          detail={`${mappedMechanismPapers} paper${mappedMechanismPapers !== 1 ? "s" : ""} contain a mechanism signal.`}
          icon={<GitBranchPlus className="h-4 w-4 text-[#8a6d3b]" />}
        />
        <SummaryCard
          title="Coverage"
          value={`${new Set([...landscape.methods.flatMap((a) => a.paperIds), ...landscape.datasets.flatMap((a) => a.paperIds)]).size}/${paperCount}`}
          detail="Papers covered by the top method or dataset mapping layers."
          icon={<Layers3 className="h-4 w-4 text-[#2c4870]" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LandscapeMethodsCard
          methods={landscape.methods}
          onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
          getExplorerHref={getExplorerHref}
          actionMode="buttons"
        />
        <LandscapeDatasetsCard
          datasets={landscape.datasets}
          onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
          getExplorerHref={getExplorerHref}
          actionMode="buttons"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LandscapeMechanismsCard
          mechanisms={landscape.mechanisms}
          onAtomClick={(slug) => router.push(getAtomDetailHref(slug))}
          getExplorerHref={getExplorerHref}
          actionMode="buttons"
        />
        <LandscapeChinaCard chinaApplicability={landscape.chinaApplicability} />
      </div>
    </div>
  );
}
