"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GitBranchPlus, Layers3, Search, Tag } from "lucide-react";

import type { LandscapeAtom, Paper, ResearchLandscape } from "@/lib/types";
import {
  buildAtomDetailHref,
  buildExplorerAtomHref,
  buildExplorerPaperHref,
  buildPaperDetailHref,
  buildProjectGraphHref,
} from "@/lib/navigation";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClusterView } from "@/components/research/cluster-view";

type ThemeAtom = LandscapeAtom & { atomType: string };

function buildThemeGroups(landscape: ResearchLandscape) {
  const atoms: ThemeAtom[] = [
    ...landscape.methods.map((atom) => ({ ...atom, atomType: "method" })),
    ...landscape.mechanisms.map((atom) => ({ ...atom, atomType: "mechanism" })),
    ...landscape.datasets.map((atom) => ({ ...atom, atomType: "dataset" })),
    ...landscape.puzzles.map((atom) => ({ ...atom, atomType: "puzzle" })),
  ];

  const groups: Record<string, { atoms: ThemeAtom[]; totalPaperRefs: number }> = {};
  for (const atom of atoms) {
    const theme =
      atom.theme || `Other ${atom.atomType.charAt(0).toUpperCase() + atom.atomType.slice(1)}s`;
    if (!groups[theme]) {
      groups[theme] = { atoms: [], totalPaperRefs: 0 };
    }
    groups[theme].atoms.push(atom);
    groups[theme].totalPaperRefs += atom.paperCount;
  }

  return Object.entries(groups).sort((a, b) => {
    const aOther = a[0].startsWith("Other ");
    const bOther = b[0].startsWith("Other ");
    if (aOther !== bOther) return aOther ? 1 : -1;
    return b[1].totalPaperRefs - a[1].totalPaperRefs;
  });
}

function atomVariant(atomType: string): BadgeProps["variant"] {
  if (atomType === "method") return "method";
  if (atomType === "mechanism") return "mechanism";
  if (atomType === "dataset") return "dataset";
  return "secondary";
}

interface ProjectThemesPanelProps {
  landscape: ResearchLandscape | null | undefined;
  papers: Paper[];
  projectSlug: string;
  projectTitle: string;
  originQuery?: string | null;
}

export function ProjectThemesPanel({
  landscape,
  papers,
  projectSlug,
  projectTitle,
  originQuery,
}: ProjectThemesPanelProps) {
  const [viewMode, setViewMode] = useState<"themes" | "clusters">("themes");
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const sortedThemes = useMemo(
    () => (landscape ? buildThemeGroups(landscape) : []),
    [landscape]
  );
  const projectPaperIds = useMemo(() => papers.map((paper) => paper.paperId), [papers]);

  const fieldGroups = useMemo(() => {
    const groups: Record<string, Paper[]> = {};
    for (const paper of papers) {
      const primaryField = paper.fields[0] || "Unclassified";
      if (!groups[primaryField]) {
        groups[primaryField] = [];
      }
      groups[primaryField].push(paper);
    }

    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [papers]);

  if (!landscape) {
    return null;
  }

  const getExplorerHref = (atomSlug: string) =>
    buildExplorerAtomHref({
      atomSlug,
      query: originQuery ?? "",
      returnTo: `/projects/${projectSlug}/themes`,
    });
  const getAtomDetailHref = (atomSlug: string) =>
    buildAtomDetailHref({
      atomSlug,
      returnTo: `/projects/${projectSlug}/themes`,
    });
  const getPaperDetailHref = (paperId: string) =>
    buildPaperDetailHref({
      paperId,
      returnTo: `/projects/${projectSlug}/themes`,
    });
  const getPaperExplorerHref = (paperId: string) =>
    buildExplorerPaperHref({
      query: paperId,
      returnTo: `/projects/${projectSlug}/themes`,
    });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-foreground">Project Themes</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Themes are grouped from recurring methods, datasets, mechanisms, and puzzles attached to
          the current project paper set. If the atom layer has not been themed yet, the fallback
          view below groups papers by their leading field tags.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={buildProjectGraphHref({
              paperIds: projectPaperIds,
              projectSlug,
              projectTitle,
              tab: "themes",
              label: `${projectTitle} · Theme graph`,
            })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <GitBranchPlus className="h-3.5 w-3.5" />
            Open Theme Graph
          </Link>
          <button
            type="button"
            onClick={() => setViewMode("themes")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "themes"
                ? "bg-foreground text-background"
                : "border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Theme Groups
          </button>
          <button
            type="button"
            onClick={() => setViewMode("clusters")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "clusters"
                ? "bg-foreground text-background"
                : "border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Paper Clusters
          </button>
        </div>
      </div>

      {viewMode === "themes" && sortedThemes.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {sortedThemes.map(([theme, group]) => (
              <a
                key={theme}
                href={`#theme-${encodeURIComponent(theme)}`}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {theme} ({group.atoms.length})
              </a>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {sortedThemes.map(([theme, group]) => (
              <Card
                key={theme}
                id={`theme-${encodeURIComponent(theme)}`}
                className="rounded-xl shadow-sm"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Tag className="h-4 w-4 text-blue-500" />
                    {theme}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {group.atoms.length} atom{group.atoms.length !== 1 ? "s" : ""} and{" "}
                    {group.totalPaperRefs} linked paper reference
                    {group.totalPaperRefs !== 1 ? "s" : ""}.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.atoms
                    .sort((a, b) => b.paperCount - a.paperCount)
                    .map((atom) => (
                      <div
                        key={atom.slug}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={getAtomDetailHref(atom.slug)}
                              className="truncate text-sm font-medium text-foreground hover:text-primary"
                            >
                              {atom.title}
                            </Link>
                            <Badge
                              variant={atomVariant(atom.atomType)}
                              className="text-[10px]"
                            >
                              {atom.atomType}
                            </Badge>
                          </div>
                          {atom.description && (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {atom.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Link
                              href={getAtomDetailHref(atom.slug)}
                              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                            >
                              Detail
                            </Link>
                            <Link
                              href={getExplorerHref(atom.slug)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              <Search className="h-3 w-3" />
                              Explorer
                            </Link>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {atom.paperCount} paper{atom.paperCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {viewMode === "clusters" && (
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GitBranchPlus className="h-4 w-4 text-indigo-500" />
              Project Theme Clusters
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Clustered from the current project paper set using shared atoms. This is the same
              clustering logic used in Research mode, but applied to a fixed project corpus.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ClusterView
              allPaperIds={projectPaperIds}
              onSelectPaper={setSelectedPaperId}
              selectedPaperId={selectedPaperId}
              showCompare={false}
              getAtomHref={getAtomDetailHref}
              getAtomExplorerHref={getExplorerHref}
              getPaperDetailHref={getPaperDetailHref}
              getPaperExplorerHref={getPaperExplorerHref}
              paperClickMode="detail"
            />
          </CardContent>
        </Card>
      )}

      {viewMode === "themes" && fieldGroups.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Layers3 className="h-4 w-4 text-sky-500" />
              Field-Based Theme Fallback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fieldGroups.map(([field, fieldPapers]) => (
              <div key={field} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{field}</p>
                    <p className="text-xs text-muted-foreground">
                      {fieldPapers.length} paper{fieldPapers.length !== 1 ? "s" : ""} in this field-led cluster
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {fieldPapers.slice(0, 5).map((paper) => (
                    <div
                      key={paper.paperId}
                      className="flex items-start justify-between gap-3 rounded-md bg-muted/30 px-3 py-2 transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={getPaperDetailHref(paper.paperId)}
                          className="block truncate text-sm font-medium text-foreground hover:text-primary"
                        >
                          {paper.title || paper.paperId}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{paper.year ?? "n/a"}</span>
                          <span className="font-mono">{paper.paperId}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Link
                            href={getPaperDetailHref(paper.paperId)}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                          >
                            Detail
                          </Link>
                          <Link
                            href={getPaperExplorerHref(paper.paperId)}
                            className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                          >
                            <Search className="h-3 w-3" />
                            Explorer
                          </Link>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {paper.fields[0] || "Unclassified"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
