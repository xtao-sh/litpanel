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
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitCompareArrows,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { ExportMenu } from "@/components/shared/export-menu";
import { getApiUrl, readErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n/locale-context";
import { getStoredActiveLibraryId } from "@/lib/libraries";
import type { Paper } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-[var(--ink-5)]";
  if (score >= 4) return "text-[var(--forest)] font-semibold";
  if (score >= 3) return "text-[#7a5a18] font-medium";
  return "text-[var(--ink-4)]";
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
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[var(--forest-soft)] text-[var(--forest-2)]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[#f4ead8] text-[#654814]",
    "bg-[#f4dfd5] text-[#742b14]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[#e9eef6] text-[#1b2e4d]",
    "bg-[var(--forest-soft)] text-[var(--forest-2)]",
  ];
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    hash = (hash * 31 + field.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatAuthors(authors: string[] | null | undefined): string {
  if (!authors || authors.length === 0) return "-";
  if (authors.length <= 2) return authors.join(", ");
  return `${authors.slice(0, 2).join(", ")} +${authors.length - 2}`;
}

function getVenueLabel(paper: Paper): string {
  const url = paper.nberUrl?.toLowerCase() ?? "";
  const id = paper.paperId?.toLowerCase() ?? "";

  if (url.includes("nber.org") || /^w\d+/.test(id)) {
    return "NBER Working Paper";
  }
  if (url.includes("doi.org")) {
    return "DOI";
  }
  return "Local Library";
}

function getSourceFileHref(paper: Paper): string | null {
  const id = paper.paperId?.toLowerCase() ?? "";
  if (/^w\d+/.test(id)) {
    return `https://www.nber.org/system/files/working_papers/${id}/${id}.pdf`;
  }
  return paper.nberUrl;
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIcon({ column }: { column: { getIsSorted: () => false | "asc" | "desc" } }) {
  const sorted = column.getIsSorted();
  if (sorted === "asc") return <ArrowUp className="ml-1 inline h-3 w-3 text-[var(--ink)]" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 inline h-3 w-3 text-[var(--ink)]" />;
  return <ArrowUpDown className="ml-1 inline h-3 w-3 text-[var(--ink-4)]/40" />;
}

// ---------------------------------------------------------------------------
// Column definitions (without checkbox — added dynamically)
// ---------------------------------------------------------------------------

function createDataColumns(t: (key: string, vars?: Record<string, string | number>) => string): ColumnDef<Paper>[] {
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
    cell: ({ row }) => {
      const title = row.original.title || row.original.paperId;
      const truncated = truncate(title, 60);
      const needsTooltip = title.length > 60;

      const titleEl = needsTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={`/paper/${row.original.paperId}`}
              className="text-sm font-medium text-[var(--ink)] hover:text-[var(--forest)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {truncated}
            </Link>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <p className="text-sm font-medium">{title}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Link
          href={`/paper/${row.original.paperId}`}
          className="text-sm font-medium text-[var(--ink)] hover:text-[var(--forest)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {truncated}
        </Link>
      );

      return titleEl;
    },
    size: 330,
  },
  {
    accessorKey: "authors",
    header: t("explorer.columns.authors"),
    cell: ({ row }) => {
      const authors = row.original.authors ?? [];
      const label = formatAuthors(authors);
      if (authors.length <= 2) {
        return <span className="text-sm text-[var(--ink-4)]">{label}</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-sm text-[var(--ink-4)]">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">{authors.join(", ")}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
    enableSorting: false,
    size: 190,
  },
  {
    id: "venue",
    header: t("explorer.columns.venue"),
    cell: ({ row }) => (
      <span className="text-sm text-[var(--ink-4)]">
        {getVenueLabel(row.original)}
      </span>
    ),
    enableSorting: false,
    size: 150,
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
      if (!fields || fields.length === 0) return <span className="text-[var(--ink-5)] text-sm">-</span>;
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
                <span className="inline-flex cursor-default items-center rounded-full border border-[var(--line-soft)] bg-[var(--paper-2)] px-2 py-0.5 text-xs text-[var(--ink-3)]">
                  +{remaining}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="flex flex-wrap gap-1.5">
                  {fields.map((field) => (
                    <span
                      key={field}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${fieldBadgeClass(field)}`}
                    >
                      {field}
                    </span>
                  ))}
                </div>
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
      if (!decision) return <span className="text-[var(--ink-5)] text-sm">-</span>;
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
  {
    id: "actions",
    header: () => <span className="sr-only">{t("explorer.columns.actions")}</span>,
    cell: ({ row }) => <PaperRowActions paper={row.original} t={t} />,
    enableSorting: false,
    size: 58,
  },
  ];
}

function PaperRowActions({
  paper,
  t,
}: {
  paper: Paper;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadMessage, setUploadMessage] = React.useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const sourceFileHref = getSourceFileHref(paper);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCopyId = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!navigator.clipboard?.writeText) {
        setOpen(false);
        return;
      }
      void navigator.clipboard.writeText(paper.paperId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
      setOpen(false);
    },
    [paper.paperId]
  );

  const handleUploadClick = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  const handlePdfSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setUploading(true);
      setUploadMessage(null);
      setOpen(false);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("paper_id", paper.paperId);
        const libraryId = getStoredActiveLibraryId() ?? 1;
        formData.append("library_id", String(libraryId));
        formData.append("reading_profile", "auto");
        formData.append("analysis_focuses", "[]");

        const response = await fetch(`${getApiUrl()}/api/pipeline/upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, t("explorer.actions.pdfUploadFailed")));
        }

        const payload = (await response.json()) as { status?: string; error?: string };
        if (payload.status && !["registered", "duplicate"].includes(payload.status)) {
          throw new Error(payload.error || t("explorer.actions.pdfUploadFailed"));
        }
        setUploadMessage(
          payload.status === "duplicate"
            ? t("explorer.actions.pdfAlreadyExists")
            : t("explorer.actions.pdfUploaded")
        );
      } catch (err) {
        setUploadMessage(
          err instanceof Error ? err.message : t("explorer.actions.pdfUploadFailed")
        );
      } finally {
        setUploading(false);
        window.setTimeout(() => setUploadMessage(null), 3200);
      }
    },
    [paper.paperId, t]
  );

  return (
    <div
      className="relative flex justify-end"
      ref={dropdownRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
        aria-label={t("explorer.actions.paperActions")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={handlePdfSelected}
      />
      {uploadMessage ? (
        <span className="absolute right-9 top-1/2 z-40 w-44 -translate-y-1/2 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-2.5 py-1 text-[11px] text-[var(--ink)] shadow-[var(--shadow-1)]">
          {uploadMessage}
        </span>
      ) : null}

      {open && (
        <div
          role="menu"
          aria-label={t("explorer.actions.paperActions")}
          className="lp-card absolute right-0 top-full z-50 mt-1.5 w-48 rounded-[var(--r-md)] border border-[var(--line-soft)] bg-[var(--paper)]/95 p-1.5 shadow-[var(--shadow-2)]"
        >
          <Link
            href={`/paper/${paper.paperId}`}
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
            onClick={() => setOpen(false)}
          >
            <FileText className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            {t("explorer.actions.openPaper")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleUploadClick}
            disabled={uploading}
            className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ink-4)]" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            )}
            {t("explorer.actions.supplementPdf")}
          </button>
          <Link
            href={`/pipeline?paperId=${encodeURIComponent(paper.paperId)}`}
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
            onClick={() => setOpen(false)}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            {t("explorer.actions.aiRead")}
          </Link>
          {sourceFileHref ? (
            <a
              href={sourceFileHref}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
              onClick={() => setOpen(false)}
            >
              <Download className="h-3.5 w-3.5 text-[var(--ink-4)]" />
              {t("explorer.actions.downloadSource")}
            </a>
          ) : (
            <span
              role="menuitem"
              aria-disabled="true"
              className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-xs text-[var(--ink-4)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("explorer.actions.noSource")}
            </span>
          )}
          <div className="my-1 border-t border-[var(--line-soft)]" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyId}
            className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-xs text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--forest)]" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[var(--ink-4)]" />
            )}
            {copied ? t("explorer.actions.copied") : t("explorer.actions.copyPaperId")}
          </button>
        </div>
      )}
    </div>
  );
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
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-4)]">
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
                className="h-3.5 w-3.5 rounded border-[var(--line)] text-[#2c4870] focus:ring-[var(--forest)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
  const selectedPaperIds = Array.from(selectedIds);
  const canCompare = selectedCount >= 2 && selectedCount <= 8;

  if (loading) {
    return <TableSkeleton rows={pageSize} cols={9} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-[var(--ink-4)]">
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
                  className="border-b border-[var(--line-soft)] bg-[var(--paper-2)]/50"
                >
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-10 px-4 text-xs font-medium uppercase tracking-wide text-[var(--ink-4)]"
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
                    className={`h-11 cursor-pointer border-b border-[var(--line-soft)] transition-colors hover:bg-[var(--paper-2)] ${
                      row.original.paperId === selectedId
                        ? "bg-[var(--ink)]/5 border-l-2 border-l-[var(--forest)]"
                        : isSelected
                          ? "bg-[#e9eef6]/60"
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
          <div className="sticky bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-3 border-t border-[#bccbe0] bg-[#e9eef6] px-4 py-2.5 shadow-[var(--shadow-2)]">
            <span className="text-sm font-medium text-[#1b2e4d]">
              {t("explorer.counts.selectedPapers", { count: selectedCount })}
            </span>
            <div className="flex items-center gap-2">
              <Link
                href={`/pipeline?paperIds=${encodeURIComponent(selectedPaperIds.join(","))}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-[#2c4870] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[#223a5e]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t("explorer.actions.aiReadSelected")}
              </Link>
              <button
                disabled={!canCompare}
                onClick={() => {
                  const href = getCompareHref
                    ? getCompareHref(selectedPaperIds)
                    : `/compare?ids=${selectedPaperIds.join(",")}`;
                  router.push(href);
                }}
                className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-[#2c4870] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[#223a5e] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                {canCompare ? t("explorer.actions.compare") : t("explorer.actions.compareSelectMore")}
              </button>
              <ExportMenu paperIds={Array.from(selectedIds)} label={t("explorer.actions.export")} />
              <button
                onClick={clearSelection}
                className="inline-flex items-center gap-1 rounded-[var(--r)] px-2 py-1.5 text-xs font-medium text-[#2c4870] transition-colors hover:bg-[#e9eef6]"
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
    <div className="flex items-center justify-between border-t border-[var(--line-soft)] px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-[var(--ink-4)]">
          {total > 0
            ? t("explorer.counts.rangeOfTotal", { start: from, end: to, total: total.toLocaleString() })
            : t("explorer.counts.noResults")}
        </p>
        {exportMenu && total > 0 && exportMenu}
      </div>
      <div className="flex items-center gap-1">
        <button
          className="rounded-[var(--r)] px-3 py-1.5 text-sm font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("common.actions.previous")}
        </button>
        {generatePageNumbers(page, totalPages).map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-[var(--ink-4)]">
              ...
            </span>
          ) : (
            <button
              key={p}
              className={`min-w-[32px] rounded-[var(--r)] px-2 py-1.5 text-sm font-medium transition-colors ${
                p === page
                  ? "bg-[var(--ink)] text-[var(--paper)] shadow-[var(--shadow-1)]"
                  : "text-[var(--ink-4)] hover:bg-[var(--paper-2)]"
              }`}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="rounded-[var(--r)] px-3 py-1.5 text-sm font-medium text-[var(--ink-4)] transition-colors hover:bg-[var(--paper-2)] disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="flex gap-3 border-b border-[var(--line-soft)] bg-[var(--paper-2)]/50 px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-3 border-b border-[var(--line-soft)] px-3 py-3"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
