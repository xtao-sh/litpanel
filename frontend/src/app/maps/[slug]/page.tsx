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
      <div className="min-w-0 flex-1 space-y-6">
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
      <div className="hidden w-56 shrink-0 space-y-3 lg:block">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="ml-3 h-3 w-5/6" />
        <Skeleton className="ml-3 h-3 w-4/6" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="ml-3 h-3 w-3/4" />
        <Skeleton className="ml-3 h-3 w-5/6" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="ml-3 h-3 w-4/6" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

function MapNotFound({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h2 className="text-xl font-semibold text-gray-900">Map not found</h2>
      <p className="mt-2 text-sm text-gray-500">
        No field map exists with the slug &ldquo;{slug}&rdquo;.
      </p>
      <Link
        href="/maps"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
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
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {data.fieldMap.title}
          </h1>

          {isFrontierGaps ? (
            /* Interactive frontier gaps view */
            <div className="max-w-4xl">
              <FrontierGapsInteractive />
            </div>
          ) : (
            /* Standard markdown rendering */
            <div className="flex gap-8">
              {/* Main content */}
              <div className="min-w-0 flex-1 max-w-3xl">
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
