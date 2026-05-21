"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveBar } from "@nivo/bar";
import { useI18n } from "@/lib/i18n/locale-context";

interface FieldDatum {
  field: string;
  paperCount: number;
  atomCount: number;
  avgScore: number;
}

interface FieldChartProps {
  data: FieldDatum[] | undefined;
  loading: boolean;
}

const FIELD_COLORS = [
  "#15803d", "#2c4870", "#b88a3b", "#8a3318", "#4a463c",
  "#166534", "#6f86a6", "#d6b678", "#b54820", "#807968",
  "#dcebe1", "#e9eef6", "#f4ead8", "#f4dfd5", "#a8a193",
];
const FIELD_SKELETON_WIDTHS = ["34%", "46%", "58%", "41%", "63%", "49%", "72%", "54%", "67%", "39%"];

const nivoTheme = {
  text: { fontSize: 14, fontFamily: "Inter, system-ui, sans-serif", fill: "#807968" },
  grid: { line: { stroke: "#e6e1d3", strokeWidth: 1, strokeDasharray: "4 4" } },
  axis: {
    ticks: { text: { fill: "#807968", fontSize: 14 } },
    legend: { text: { fill: "#4a463c", fontSize: 14, fontWeight: 500 } },
    domain: { line: { stroke: "transparent" } },
  },
  tooltip: {
    container: {
      background: "#fafaf7",
      border: "1px solid #e6e1d3",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      fontSize: 13,
      padding: "8px 12px",
    },
  },
};

function truncateField(field: string, max: number = 30): string {
  if (field.length <= max) return field;
  return field.slice(0, max - 1) + "\u2026";
}

export function FieldChart({ data, loading }: FieldChartProps) {
  const { t } = useI18n();
  const top15 = data
    ? data
        .slice()
        .sort((a, b) => b.paperCount - a.paperCount)
        .slice(0, 15)
        .reverse()
    : [];

  const chartData = top15.map((d) => ({
    field: truncateField(d.field),
    paperCount: d.paperCount,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          {t("dashboard.fieldChart.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          {loading || !data ? (
            <div className="flex flex-col gap-2 h-full justify-center">
              {FIELD_SKELETON_WIDTHS.map((width, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton
                    className="h-4"
                    style={{ width }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveBar
              data={chartData}
              keys={["paperCount"]}
              indexBy="field"
              layout="horizontal"
              margin={{ top: 5, right: 30, bottom: 30, left: 200 }}
              padding={0.25}
              colors={(d) => FIELD_COLORS[d.index % FIELD_COLORS.length]}
              borderRadius={4}
              axisBottom={{
                legend: t("dashboard.fieldChart.axisPapers"),
                legendPosition: "middle",
                legendOffset: 22,
              }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 8,
              }}
              enableLabel={true}
              label={(d) => d.value != null ? String(d.value) : ""}
              labelSkipWidth={30}
              labelTextColor="#fafaf7"
              animate={true}
              motionConfig="gentle"
              theme={nivoTheme}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
