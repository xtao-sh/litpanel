"use client";

import React from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import type { Atom } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function atomTypeVariant(
  type: string
): BadgeProps["variant"] {
  switch (type) {
    case "mechanism":
      return "mechanism";
    case "method":
      return "method";
    case "dataset":
      return "dataset";
    case "puzzle":
      return "puzzle";
    default:
      return "secondary";
  }
}

function evidenceBadgeClass(strength: string | null): string {
  switch (strength) {
    case "strong":
      return "bg-green-100 text-green-800";
    case "moderate":
      return "bg-yellow-100 text-yellow-800";
    case "weak":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
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
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(t: (key: string, vars?: Record<string, string | number>) => string): ColumnDef<Atom>[] {
  return [
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
    cell: ({ row }) => (
      <Link
        href={`/atom/${row.original.slug}`}
        className="text-sm text-blue-600 hover:underline"
      >
        {row.original.title}
      </Link>
    ),
    size: 250,
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.type")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => (
      <Badge variant={atomTypeVariant(row.original.type)} className="text-xs">
        {t(`explorer.values.${row.original.type}`)}
      </Badge>
    ),
    size: 110,
  },
  {
    accessorKey: "description",
    header: t("explorer.columns.description"),
    cell: ({ row }) => {
      const desc = row.original.description;
      const truncated = truncate(desc, 80);
      const needsTooltip = desc && desc.length > 80;

      if (needsTooltip) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-sm text-gray-600">
                {truncated}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              <p className="text-sm">{desc}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      return (
        <span className="text-sm text-gray-600">{truncated || "-"}</span>
      );
    },
    enableSorting: false,
    size: 300,
  },
  {
    accessorKey: "evidenceStrength",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.evidence")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => {
      const strength = row.original.evidenceStrength;
      if (!strength) return <span className="text-gray-400 text-sm">-</span>;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${evidenceBadgeClass(strength)}`}
        >
          {t(`explorer.values.${strength}`)}
        </span>
      );
    },
    size: 100,
  },
  {
    accessorKey: "paperCount",
    header: ({ column }) => (
      <button
        className="flex items-center text-left font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("explorer.columns.papers")}
        <SortIcon column={column} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">{row.original.paperCount}</span>
    ),
    size: 70,
  },
  ];
}

// ---------------------------------------------------------------------------
// Table Component
// ---------------------------------------------------------------------------

interface AtomTableProps {
  data: Atom[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onRowClick: (atom: Atom) => void;
  selectedSlug: string | null;
}

export function AtomTable({
  data,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onRowClick,
  selectedSlug,
}: AtomTableProps) {
  const { t } = useI18n();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // TanStack Table exposes imperative instance methods; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: createColumns(t),
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return <TableSkeleton rows={pageSize} cols={5} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-gray-500">
        <p className="text-sm">{t("explorer.empty.atoms")}</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col">
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
                      style={{ width: header.getSize() }}
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
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`h-11 cursor-pointer border-b border-border transition-colors hover:bg-accent/50 ${
                    row.original.slug === selectedSlug
                      ? "bg-primary/5 border-l-2 border-l-primary"
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
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Pagination (shared pattern)
// ---------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {total > 0
          ? t("explorer.counts.rangeOfTotal", { start: from, end: to, total: total.toLocaleString() })
          : t("explorer.counts.noResults")}
      </p>
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
