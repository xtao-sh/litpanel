"use client";

import React, { use } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { ArrowLeft, ExternalLink, Filter } from "lucide-react";
import { GET_ATOM } from "@/lib/queries";
import { buildAtomDetailHref, buildExplorerAtomHref, buildPaperDetailHref } from "@/lib/navigation";
import type { AtomDetail } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AtomHeader } from "@/components/atom/atom-header";
import { PaperList } from "@/components/atom/paper-list";

const typeBadgeVariant: Record<string, "mechanism" | "method" | "dataset" | "puzzle"> = {
  mechanism: "mechanism",
  method: "method",
  dataset: "dataset",
  puzzle: "puzzle",
};

const evidenceColors: Record<string, string> = {
  strong: "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]",
  moderate: "bg-[#f4ead8] text-[#654814] border-[#d6b678]",
  weak: "bg-[#f4dfd5] text-[#742b14] border-[#da9a80]",
};

const accessColors: Record<string, string> = {
  public: "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]",
  restricted: "bg-[#f4ead8] text-[#654814] border-[#d6b678]",
  proprietary: "bg-[#f4dfd5] text-[#742b14] border-[#da9a80]",
};

function renderDescription(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((paragraph, pIdx) => {
    const lines = paragraph.split(/\n/);
    const isBulletList = lines.every(
      (line) => line.trim().startsWith("- ") || line.trim() === ""
    );

    if (isBulletList) {
      return (
        <ul key={pIdx} className="list-disc list-inside space-y-1 text-sm text-[var(--ink-4)]">
          {lines
            .filter((line) => line.trim().startsWith("- "))
            .map((line, lIdx) => (
              <li key={lIdx}>{renderInlineFormatting(line.trim().slice(2))}</li>
            ))}
        </ul>
      );
    }

    return (
      <p key={pIdx} className="text-sm leading-relaxed text-[var(--ink-4)]">
        {lines.map((line, lIdx) => (
          <React.Fragment key={lIdx}>
            {lIdx > 0 && <br />}
            {renderInlineFormatting(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-[var(--ink)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function AtomSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-96" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_0.54fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface AtomDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default function AtomDetailPage({ params }: AtomDetailPageProps) {
  const { slug } = use(params);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const currentPageHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const backHref = returnTo || "/explorer?tab=atoms";
  const backLabel = returnTo?.startsWith("/projects/")
    ? "Back to Project"
    : returnTo
      ? "Back"
      : "Back to Explorer";
  const breadcrumbRootLabel = returnTo?.startsWith("/projects/")
    ? "Project"
    : returnTo
      ? "Return"
      : "Explorer";
  const explorerHref = buildExplorerAtomHref({
    atomSlug: slug,
    returnTo: currentPageHref,
  });
  const getPaperHref = (paperId: string) =>
    buildPaperDetailHref({
      paperId,
      returnTo: currentPageHref,
    });
  const getAtomHref = (atomSlug: string) =>
    buildAtomDetailHref({
      atomSlug,
      returnTo: currentPageHref,
    });

  const { data, loading, error } = useQuery<{ atom: AtomDetail }>(GET_ATOM, {
    variables: { slug },
  });

  if (loading) {
    return <AtomSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-semibold text-[var(--ink)]">Error loading atom</h2>
        <p className="mt-2 text-sm text-[var(--ink-4)]">{error.message}</p>
        <Link
          href={backHref}
          className="mt-4 text-sm font-medium text-[#2c4870] hover:text-[#1b2e4d] hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  const atom = data?.atom;

  if (!atom) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-semibold text-[var(--ink)]">Atom not found</h2>
        <p className="mt-2 text-sm text-[var(--ink-4)]">
          The atom &ldquo;{slug}&rdquo; could not be found.
        </p>
        <Link
          href={backHref}
          className="mt-4 text-sm font-medium text-[#2c4870] hover:text-[#1b2e4d] hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  const evidenceClass = atom.evidenceStrength
    ? evidenceColors[atom.evidenceStrength.toLowerCase()] || "bg-[var(--paper-2)] text-[var(--ink)] border-[var(--line-soft)]"
    : null;

  const accessClass = atom.access
    ? accessColors[atom.access.toLowerCase()] || "bg-[var(--paper-2)] text-[var(--ink)] border-[var(--line-soft)]"
    : null;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-[var(--ink-4)]">
        <Link href={backHref} className="hover:text-[var(--ink)] transition-colors">{breadcrumbRootLabel}</Link>
        <span>/</span>
        <Link href={explorerHref} className="hover:text-[var(--ink)] transition-colors">Atoms</Link>
        <span>/</span>
        <span className="text-[var(--ink)]">{atom.title}</span>
      </nav>

      <AtomHeader atom={atom} />

      {/* Quick action: filter papers by this atom in Explorer */}
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <Link
          href={explorerHref}
          className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] px-4 py-2 text-sm font-medium text-[#223a5e] transition-colors hover:bg-[#e9eef6] hover:border-[#bccbe0]"
        >
          <Filter className="h-4 w-4" />
          View all {atom.paperCount} paper{atom.paperCount !== 1 ? "s" : ""} in Explorer
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.54fr]">
        {/* Main Content */}
        <div className="space-y-6">
          {/* Description */}
          {atom.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {renderDescription(atom.description)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* When to Use — methods only */}
          {atom.type === "method" && atom.whenToUse && (
            <Card className="border-[var(--forest)] bg-[var(--forest-soft)]/50">
              <CardHeader>
                <CardTitle className="text-base text-[var(--forest-2)]">When to Use</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {renderDescription(atom.whenToUse)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dataset access and URL */}
          {atom.type === "dataset" && (atom.access || atom.url) && (
            <Card className="border-[#bccbe0] bg-[#e9eef6]/50">
              <CardHeader>
                <CardTitle className="text-base text-[#172741]">Data Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {atom.access && accessClass && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--ink-4)]">Access Level:</span>
                    <Badge className={`text-xs border capitalize ${accessClass}`}>
                      {atom.access}
                    </Badge>
                  </div>
                )}
                {atom.url && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--ink-4)]">URL:</span>
                    <a
                      href={atom.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-[#2c4870] hover:text-[#1b2e4d] hover:underline"
                    >
                      {atom.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Connected Papers */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Connected Papers
                  {atom.papers && atom.papers.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-[var(--ink-4)]">
                      ({atom.papers.length})
                    </span>
                  )}
                </CardTitle>
                {atom.papers && atom.papers.length > 0 && (
                  <Link
                    href={explorerHref}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-[#e9eef6] px-3 py-1.5 text-xs font-medium text-[#223a5e] transition-colors hover:bg-[#e9eef6]"
                  >
                    <Filter className="h-3 w-3" />
                    View {atom.papers.length} in Explorer
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <PaperList papers={atom.papers || []} getPaperHref={getPaperHref} />
            </CardContent>
          </Card>

          {/* Backlinks */}
          {atom.backlinkNotes && atom.backlinkNotes.length > 0 && (
            <Card className="border-[#bccbe0] bg-[#e9eef6]/30">
              <CardHeader>
                <CardTitle className="text-base text-[#223a5e]">
                  Backlinks
                  <span className="ml-1.5 text-sm font-normal text-[#4e688d]">
                    Referenced by {atom.backlinkNotes.length} note{atom.backlinkNotes.length !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {atom.backlinkNotes.map((bl) => {
                    const blHref =
                      bl.entityType === "paper"
                        ? getPaperHref(bl.entityId)
                        : bl.entityType === "atom"
                        ? getAtomHref(bl.entityId)
                        : "#";
                    return (
                      <Link
                        key={`${bl.entityType}-${bl.entityId}`}
                        href={blHref}
                        className="flex items-start gap-2 rounded-[var(--r)] border border-[#dfe7f2] bg-[var(--paper)] p-2.5 hover:bg-[#e9eef6] transition-colors"
                      >
                        <Badge className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5 bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]">
                          {bl.entityType}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-[#2c4870]">
                            {bl.entityId}
                          </span>
                          <p className="text-xs text-[var(--ink-4)] mt-0.5 line-clamp-2">
                            {bl.notePreview}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {/* Quick Stats */}
          <Card className="bg-[var(--paper-2)]/50">
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-[var(--ink-4)]">Type</dt>
                  <dd>
                    <Badge
                      variant={typeBadgeVariant[atom.type] || "secondary"}
                      className="text-xs capitalize"
                    >
                      {atom.type}
                    </Badge>
                  </dd>
                </div>

                {atom.evidenceStrength && evidenceClass && (
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-[var(--ink-4)]">Evidence</dt>
                    <dd>
                      <Badge className={`text-xs border capitalize ${evidenceClass}`}>
                        {atom.evidenceStrength}
                      </Badge>
                    </dd>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <dt className="text-sm text-[var(--ink-4)]">Paper Count</dt>
                  <dd className="text-sm font-semibold text-[var(--ink)]">
                    {atom.paperCount}
                  </dd>
                </div>

                {atom.type === "dataset" && atom.access && accessClass && (
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-[var(--ink-4)]">Access</dt>
                    <dd>
                      <Badge className={`text-xs border capitalize ${accessClass}`}>
                        {atom.access}
                      </Badge>
                    </dd>
                  </div>
                )}

                <div className="border-t border-[var(--line-soft)] pt-3">
                  <dt className="text-xs text-[var(--ink-4)]">Slug</dt>
                  <dd className="mt-0.5 font-mono text-xs text-[var(--ink-4)]">
                    {atom.slug}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Similar Atoms (via embeddings) */}
          {atom.similarAtoms && atom.similarAtoms.length > 0 ? (
            <Card className="border-[#bccbe0]">
              <CardHeader>
                <CardTitle className="text-base text-[#223a5e]">
                  Similar Atoms
                </CardTitle>
                <p className="text-[11px] text-[#4e688d] mt-0.5">
                  Based on content similarity
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {atom.similarAtoms.map((sa) => {
                    const pct = Math.round(sa.similarityScore * 100);
                    return (
                      <Link
                        key={sa.slug}
                        href={getAtomHref(sa.slug)}
                        className="block rounded-[var(--r)] border border-[#dfe7f2] p-2.5 transition-colors hover:bg-[#e9eef6]/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant={typeBadgeVariant[sa.type] || "secondary"}
                              className="text-[10px] capitalize shrink-0"
                            >
                              {sa.type}
                            </Badge>
                            <span className="text-sm font-medium text-[var(--ink)] truncate">
                              {sa.title}
                            </span>
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold text-[#2c4870]">
                            {pct}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-[#e9eef6] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#2c4870] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {sa.description && (
                          <p className="mt-1.5 text-xs text-[var(--ink-4)] line-clamp-2">
                            {sa.description}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Similar Atoms</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--ink-4)]">
                  Semantic similarity unavailable.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Co-occurring Atoms */}
          {atom.cooccurringAtoms && atom.cooccurringAtoms.length > 0 && (
            <Card className="border-[#d6b678]">
              <CardHeader>
                <CardTitle className="text-base text-[#7a5a18]">
                  Often Used Together
                </CardTitle>
                <p className="text-[11px] text-[#8a6d3b] mt-0.5">
                  Atoms co-occurring in the same papers
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {atom.cooccurringAtoms.map((ca) => (
                    <Link
                      key={ca.slug}
                      href={getAtomHref(ca.slug)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#f4ead8] bg-[#f4ead8]/50 px-2.5 py-1 transition-colors hover:bg-[#f4ead8]/70"
                    >
                      <Badge
                        variant={typeBadgeVariant[ca.type] || "secondary"}
                        className="text-[9px] px-1 py-0 capitalize shrink-0"
                      >
                        {ca.type}
                      </Badge>
                      <span className="text-xs font-medium text-[var(--ink-4)] truncate max-w-[140px]">
                        {ca.title}
                      </span>
                      <span className="text-[10px] text-[#8a6d3b] font-medium shrink-0">
                        {ca.coCount}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
