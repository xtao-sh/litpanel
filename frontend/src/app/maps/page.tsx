"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { collectErrorMessages } from "@/components/shared/query-error-banner";
import {
  Globe,
  FlaskConical,
  Swords,
  Compass,
  Lightbulb,
  ArrowRight,
} from "lucide-react";

import { GET_FIELD_MAPS } from "@/lib/queries";
import type { FieldMap } from "@/lib/types";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/locale-context";

// ---------------------------------------------------------------------------
// Map metadata keyed by slug
// ---------------------------------------------------------------------------

const MAP_META: Record<
  string,
  {
    titleKey: string;
    descriptionKey: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  research_landscape: {
    titleKey: "maps.registry.researchLandscape.title",
    descriptionKey: "maps.registry.researchLandscape.description",
    icon: Globe,
  },
  method_registry: {
    titleKey: "maps.registry.methodRegistry.title",
    descriptionKey: "maps.registry.methodRegistry.description",
    icon: FlaskConical,
  },
  debate_map: {
    titleKey: "maps.registry.debateMap.title",
    descriptionKey: "maps.registry.debateMap.description",
    icon: Swords,
  },
  frontier_gaps: {
    titleKey: "maps.registry.frontierGaps.title",
    descriptionKey: "maps.registry.frontierGaps.description",
    icon: Compass,
  },
  idea_bank: {
    titleKey: "maps.registry.ideaBank.title",
    descriptionKey: "maps.registry.ideaBank.description",
    icon: Lightbulb,
  },
};

// Fallback icon for unknown slugs
function DefaultIcon({ className }: { className?: string }) {
  return <Globe className={className} />;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function MapGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="paper-panel overflow-hidden p-0">
          <CardHeader className="pb-3 pt-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-2xl" />
              <Skeleton className="h-5 w-40" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface FieldMapsData {
  fieldMaps: Pick<FieldMap, "slug" | "title">[];
}

export default function FieldMapsPage() {
  const { data, loading, error } = useQuery<FieldMapsData>(GET_FIELD_MAPS);
  const { t } = useI18n();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="paper-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <p className="section-kicker">{t("maps.index.kicker")}</p>
          <div>
            <h2 className="font-display text-4xl tracking-tight text-foreground sm:text-5xl">
              {t("maps.index.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              {t("maps.index.body")}
            </p>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
          <p className="section-kicker">{t("maps.index.infoKicker")}</p>
          <p className="mt-2 text-sm leading-6 text-foreground/80">
            {t("maps.index.infoBody")}
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="paper-panel border-red-200/80 bg-red-50/80 p-4 shadow-none">
          <p className="text-sm font-medium text-red-700">{t("maps.index.errorTitle")}</p>
          <p className="mt-1 text-xs text-red-700">
            {collectErrorMessages([error]) || t("maps.index.errorBody")}
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && <MapGridSkeleton />}

      {/* Cards grid */}
      {data?.fieldMaps && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.fieldMaps.map((map) => {
            const meta = MAP_META[map.slug];
            const Icon = meta?.icon ?? DefaultIcon;
            const title = meta?.titleKey ? t(meta.titleKey) : map.title;
            const description = meta?.descriptionKey
              ? t(meta.descriptionKey)
              : t("maps.registry.fallback.description");

            return (
              <Link key={map.slug} href={`/maps/${map.slug}`}>
                <Card className="paper-panel group h-full cursor-pointer p-0 transition-all duration-200 hover:-translate-y-1">
                  <CardHeader className="border-b border-border/70 pb-4 pt-5">
                    <p className="section-kicker mb-3">{t("maps.common.fieldBrief")}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border border-border/70 bg-background/80 text-primary transition-colors group-hover:bg-accent/55">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-display text-2xl tracking-tight text-foreground">
                        {title}
                      </h3>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 py-5">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                    <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.18em] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      {t("maps.index.openMap")} <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
