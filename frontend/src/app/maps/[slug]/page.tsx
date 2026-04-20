"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { ArrowLeft } from "lucide-react";

import { GET_FIELD_MAP } from "@/lib/queries";
import type { FieldMap } from "@/lib/types";

import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/maps/markdown-renderer";
import { TocSidebar } from "@/components/maps/toc-sidebar";
import { FrontierGapsInteractive } from "@/components/maps/frontier-gaps-interactive";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function MapSkeleton() {
  return (
    <div className="flex gap-8">
      {/* Main content skeleton */}
      <div className="paper-panel min-w-0 flex-1 space-y-6 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="mt-6 h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-6 h-6 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="mt-6 h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {/* TOC sidebar skeleton */}
      <div className="paper-panel hidden w-64 shrink-0 space-y-3 p-5 lg:block">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

function MapNotFound({ slug }: { slug: string }) {
  return (
    <div className="paper-panel flex flex-col items-center justify-center py-24 text-center">
      <p className="section-kicker">Missing Brief</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground">
        Map not found
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        No field map exists with the slug &ldquo;{slug}&rdquo;.
      </p>
      <Link
        href="/maps"
        className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent/50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Field Maps
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface FieldMapDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default function FieldMapDetailPage({ params }: FieldMapDetailPageProps) {
  const { slug } = use(params);

  const isFrontierGaps = slug === "frontier_gaps";

  const { data, loading, error } = useQuery<{ fieldMap: FieldMap | null }>(
    GET_FIELD_MAP,
    { variables: { slug } }
  );

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/maps"
        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Field Maps
      </Link>

      {/* Loading */}
      {loading && <MapSkeleton />}

      {/* Error / not found */}
      {!loading && (error || !data?.fieldMap) && <MapNotFound slug={slug} />}

      {/* Content */}
      {data?.fieldMap && (
        <>
          <div className="paper-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <p className="section-kicker">Field Brief</p>
              <h1 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
                {data.fieldMap.title}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                Read the synthesized map as a dossier: major sections, linked
                papers, and recurring questions are all structured for long-form
                navigation.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
              <p className="section-kicker">Use This View</p>
              <p className="mt-2 text-sm leading-6 text-foreground/80">
                Maps are the atlas layer. They condense scattered paper-level
                detail into field narratives, methods, debates, and gaps.
              </p>
            </div>
          </div>

          {isFrontierGaps ? (
            /* Interactive frontier gaps view */
            <div className="paper-panel max-w-4xl p-6">
              <FrontierGapsInteractive />
            </div>
          ) : (
            /* Standard markdown rendering */
            <div className="flex gap-8">
              {/* Main content */}
              <div className="paper-panel min-w-0 max-w-3xl flex-1 p-6">
                <MarkdownRenderer content={data.fieldMap.content} />
              </div>

              {/* TOC sidebar */}
              <div className="hidden w-56 shrink-0 lg:block">
                <TocSidebar content={data.fieldMap.content} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
