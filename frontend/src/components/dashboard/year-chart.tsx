"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveBar } from "@nivo/bar";

interface YearDatum {
  year: number;
  count: number;
}

interface YearChartProps {
  data: YearDatum[] | undefined;
  loading: boolean;
}

const YEAR_SKELETON_HEIGHTS = ["22%", "28%", "34%", "41%", "48%", "54%", "61%", "67%", "52%", "44%", "36%", "29%"];

const nivoTheme = {
  text: { fontSize: 14, fontFamily: "Inter, system-ui, sans-serif", fill: "#64748B" },
  grid: { line: { stroke: "#E2E8F0", strokeWidth: 1, strokeDasharray: "4 4" } },
  axis: {
    ticks: { text: { fill: "#64748B", fontSize: 13 } },
    legend: { text: { fill: "#475569", fontSize: 14, fontWeight: 500 } },
    domain: { line: { stroke: "transparent" } },
  },
  tooltip: {
    container: {
      background: "#fff",
      border: "1px solid #E2E8F0",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      fontSize: 13,
      padding: "8px 12px",
    },
  },
};

export function YearChart({ data, loading }: YearChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Papers by Year</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          {loading || !data ? (
            <div className="flex flex-col gap-2 h-full justify-end pb-8">
              {YEAR_SKELETON_HEIGHTS.map((height, i) => (
                <Skeleton
                  key={i}
                  className="w-full"
                  style={{ height }}
                />
              ))}
            </div>
          ) : (
            <ResponsiveBar
              data={data
                .slice()
                .sort((a, b) => a.year - b.year)
                .map((d) => ({ year: String(d.year), count: d.count }))}
              keys={["count"]}
              indexBy="year"
              margin={{ top: 10, right: 20, bottom: 50, left: 60 }}
              padding={0.3}
              colors={["#4F8EF7"]}
              borderRadius={4}
              axisBottom={{
                tickRotation: -45,
              }}
              axisLeft={{
                legend: "Papers",
                legendPosition: "middle",
                legendOffset: -45,
              }}
              enableLabel={false}
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
