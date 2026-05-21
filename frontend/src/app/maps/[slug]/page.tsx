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
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function MapSkeleton() {
  return (
    <div className="flex gap-8">
      {/* Main content skeleton */}
      <div className="lp-card min-w-0 flex-1 space-y-6 p-6">
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
      <div className="lp-card hidden w-64 shrink-0 space-y-3 p-5 lg:block">
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
  const { t } = useI18n();
  return (
    <div className="lp-card flex flex-col items-center justify-center py-24 text-center">
      <p className="section-kicker">{t("maps.detail.missingKicker")}</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight text-[var(--ink)]">
        {t("maps.detail.notFoundTitle")}
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-4)]">
        {t("maps.detail.notFoundBody", { slug })}
      </p>
      <Link
        href="/maps"
        className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] px-4 py-2 text-sm font-medium text-[var(--forest)] transition-colors hover:bg-[var(--paper-2)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("maps.detail.backToMaps")}
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
  const { t } = useI18n();

  const isFrontierGaps = slug === "frontier_gaps";

  const { data, loading, error } = useQuery<{ fieldMap: FieldMap | null }>(
    GET_FIELD_MAP,
    { variables: { slug } }
  );
  const localizedTitle = isFrontierGaps
    ? t("maps.registry.frontierGaps.title")
    : data?.fieldMap?.title;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/maps"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-4 py-2 text-sm text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("maps.detail.allMaps")}
      </Link>

      {/* Loading */}
      {loading && <MapSkeleton />}

      {/* Error / not found */}
      {!loading && (error || !data?.fieldMap) && <MapNotFound slug={slug} />}

      {/* Content */}
      {data?.fieldMap && (
        <>
          <div className="lp-card grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <p className="section-kicker">{t("maps.common.fieldBrief")}</p>
              <h1 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
                {localizedTitle}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--ink-4)] sm:text-[15px]">
                {isFrontierGaps ? t("maps.detail.frontierGapsBody") : t("maps.detail.body")}
              </p>
            </div>
            <div className="rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
              <p className="section-kicker">{t("maps.detail.infoKicker")}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-3)]">
                {t("maps.detail.infoBody")}
              </p>
            </div>
          </div>

          {isFrontierGaps ? (
            /* Interactive frontier gaps view */
            <div className="lp-card max-w-5xl p-6">
              <FrontierGapsInteractive />
            </div>
          ) : (
            /* Standard markdown rendering */
            <div className="flex gap-8">
              {/* Main content */}
              <div className="lp-card min-w-0 max-w-3xl flex-1 p-6">
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
