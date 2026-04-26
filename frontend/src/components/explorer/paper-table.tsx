"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown, ArrowUp, ArrowDown, GitCompareArrows, X } from "lucide-react";
import { ExportMenu } from "@/components/shared/export-menu";
import { useI18n } from "@/lib/i18n/locale-context";
import type { Paper } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 4) return "text-green-600 font-semibold";
  if (score >= 3) return "text-yellow-600 font-medium";
  return "text-gray-500";
}

function triageBadgeVariant(
  decision: string | null
): "method" | "mechanism" | "secondary" {
  switch (decision) {
    case "DEEP_READ":
      return "method";
    case "SKIM":
      return "mechanism";
    default:
      return "secondary";
  }
}

function fieldBadgeClass(field: string): string {
  // Assign colors based on the field name hash to give consistent per-field coloring
  const colors = [
    "bg-blue-100 text-blue-800",
    "bg-emerald-100 text-emerald-800",
    "bg-purple-100 text-purple-800",
    "bg-amber-100 text-amber-800",
    "bg-rose-100 text-rose-800",
    "bg-cyan-100 text-cyan-800",
    "bg-indigo-100 text-indigo-800",
    "bg-teal-100 text-teal-800",
  ];
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    hash = (hash * 31 + field.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIcon({ column }: { column: { getIsSorted: () => false | "asc" | "desc" } }) {
  const sorted = column.getIsSorted();
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3 w-3 text-foreground" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3 w-3 text-foreground" />;
  return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/40" />;
}

// ---------------------------------------------------------------------------
// Column definitions (without checkbox — added dynamically)
// ---------------------------------------------------------------------------

function createDataColumns(t: (key: string, vars?: Record<string, string | number>) => string): ColumnDef<Paper>[] {
  return [
  {
    accessorKey: "paperId",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.id")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => (
      <Link
        href={`/paper/${row.original.paperId}`}
        className="font-mono text-sm text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.paperId}
      </Link>
    ),
    size: 90,
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.title")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const title = row.original.title || row.original.paperId;
      const abstract = row.original.abstract;
      const tldr = row.original.tldr;
      const truncated = truncate(title, 60);
      const needsTooltip = (title && title.length > 60) || abstract;

      const titleEl = needsTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-sm">{truncated}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {title && title.length > 60 && (
              <p className="text-sm font-medium">{title}</p>
            )}
            {abstract && (
              <p className={`text-xs text-muted-foreground italic ${title && title.length > 60 ? "mt-1.5 pt-1.5 border-t border-border/50" : ""}`}>
                {truncate(abstract, 150)}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-sm">{truncated}</span>
      );

      return (
        <div className="flex flex-col gap-0.5">
          {titleEl}
          {tldr && (
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]">
              {truncate(tldr, 100)}
            </p>
          )}
        </div>
      );
    },
    size: 300,
  },
  {
    accessorKey: "year",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.year")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{row.original.year ?? "-"}</span>
    ),
    size: 70,
  },
  {
    accessorKey: "fields",
    header: t("explorer.columns.fields"),
    cell: ({ row }) => {
      const fields = row.original.fields;
      if (!fields || fields.length === 0) return <span className="text-gray-400 text-sm">-</span>;
      const displayed = fields.slice(0, 2);
      const remaining = fields.length - 2;
      return (
        <div className="flex flex-wrap gap-1">
          {displayed.map((f) => (
            <span
              key={f}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${fieldBadgeClass(f)}`}
            >
              {f.length > 18 ? f.slice(0, 16) + ".." : f}
            </span>
          ))}
          {remaining > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                  +{remaining}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm">{fields.slice(2).join(", ")}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
    enableSorting: false,
    size: 200,
  },
  {
    accessorKey: "averageScore",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.score")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const score = row.original.averageScore;
      return (
        <span className={`text-sm tabular-nums ${scoreColor(score)}`}>
          {score != null ? score.toFixed(1) : "-"}
        </span>
      );
    },
    size: 70,
  },
  {
    accessorKey: "triageDecision",
    header: t("explorer.columns.triage"),
    cell: ({ row }) => {
      const decision = row.original.triageDecision;
      if (!decision) return <span className="text-gray-400 text-sm">-</span>;
      return (
        <Badge variant={triageBadgeVariant(decision)} className="text-xs">
          {decision === "DEEP_READ"
            ? t("explorer.values.deepRead")
            : decision === "SKIM"
              ? t("explorer.values.skim")
              : decision === "SKIP"
                ? t("explorer.values.skip")
                : decision}
        </Badge>
      );
    },
    enableSorting: false,
    size: 100,
  },
  ];
}

// ---------------------------------------------------------------------------
// Table Component
// ---------------------------------------------------------------------------

interface PaperTableProps {
  data: Paper[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onRowClick: (paper: Paper) => void;
  selectedId: string | null;
  getCompareHref?: (paperIds: string[]) => string;
  compareIds?: Set<string>;
  onToggleCompare?: (paperId: string, e: React.MouseEvent) => void;
  onClearCompare?: () => void;
}

export function PaperTable({
  data,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onRowClick,
  selectedId,
  getCompareHref,
  compareIds,
  onToggleCompare,
  onClearCompare,
}: PaperTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [localSelectedIds, setLocalSelectedIds] = React.useState<Set<string>>(new Set());
  const selectedIds = compareIds ?? localSelectedIds;

  const toggleSelect = React.useCallback((paperId: string, e: React.MouseEvent) => {
    if (onToggleCompare) {
      onToggleCompare(paperId, e);
      return;
    }

    e.stopPropagation();
    setLocalSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else if (next.size < 8) {
        next.add(paperId);
      }
      return next;
    });
  }, [onToggleCompare]);

  const clearSelection = React.useCallback(() => {
    if (onClearCompare) {
      onClearCompare();
      return;
    }
    setLocalSelectedIds(new Set());
  }, [onClearCompare]);

  // Build columns with checkbox
  const columns: ColumnDef<Paper>[] = React.useMemo(
    () => [
      {
        id: "select",
        header: () => (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("explorer.columns.select")}
          </span>
        ),
        cell: ({ row }) => {
          const isChecked = selectedIds.has(row.original.paperId);
          const isDisabled = !isChecked && selectedIds.size >= 8;
          return (
            <div
              className="flex items-center justify-center"
              onClick={(e) => {
                if (!isDisabled) toggleSelect(row.original.paperId, e);
                else e.stopPropagation();
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                readOnly
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          );
        },
        enableSorting: false,
        size: 40,
      },
      ...createDataColumns(t),
    ],
    [selectedIds, toggleSelect, t]
  );

  // TanStack Table exposes imperative instance methods; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedCount = selectedIds.size;
  const canCompare = selectedCount >= 2 && selectedCount <= 8;

  if (loading) {
    return <TableSkeleton rows={pageSize} cols={7} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-gray-500">
        <p className="text-sm">{t("explorer.empty.papers")}</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border bg-muted/50"
                >
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      style={{
                        width: header.getSize(),
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = selectedIds.has(row.original.paperId);
                return (
                  <tr
                    key={row.id}
                    className={`h-11 cursor-pointer border-b border-border transition-colors hover:bg-accent/50 ${
                      row.original.paperId === selectedId
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : isSelected
                          ? "bg-blue-50/60"
                          : ""
                    }`}
                    onClick={() => onRowClick(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 text-sm">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={onPageChange}
          exportMenu={
            <ExportMenu paperIds={data.map((p) => p.paperId)} compact />
          }
        />

        {/* Floating action bar for selected papers */}
        {selectedCount > 0 && (
          <div className="sticky bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-3 border-t border-blue-200 bg-blue-50 px-4 py-2.5 shadow-lg">
            <span className="text-sm font-medium text-blue-800">
              {t("explorer.counts.selectedPapers", { count: selectedCount })}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={!canCompare}
                onClick={() => {
                  const compareIds = Array.from(selectedIds);
                  const href = getCompareHref
                    ? getCompareHref(compareIds)
                    : `/compare?ids=${compareIds.join(",")}`;
                  router.push(href);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                {canCompare ? t("explorer.actions.compare") : t("explorer.actions.compareSelectMore")}
              </button>
              <ExportMenu paperIds={Array.from(selectedIds)} label={t("explorer.actions.export")} />
              <button
                onClick={clearSelection}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
              >
                <X className="h-3.5 w-3.5" />
                {t("explorer.actions.clear")}
              </button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  exportMenu,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  exportMenu?: React.ReactNode;
}) {
  const { t } = useI18n();
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {total > 0
            ? t("explorer.counts.rangeOfTotal", { start: from, end: to, total: total.toLocaleString() })
            : t("explorer.counts.noResults")}
        </p>
        {exportMenu && total > 0 && exportMenu}
      </div>
      <div className="flex items-center gap-1">
        <button
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("common.actions.previous")}
        </button>
        {generatePageNumbers(page, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-muted-foreground">
              ...
            </span>
          ) : (
            <button
              key={p}
              className={`min-w-[32px] rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                p === page
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("common.actions.next")}
        </button>
      </div>
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  ) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

// ---------------------------------------------------------------------------
// Table Skeleton
// ---------------------------------------------------------------------------

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-0">
      <div className="flex gap-3 border-b border-gray-200 bg-gray-50/50 px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-3 border-b border-gray-100 px-3 py-3"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
