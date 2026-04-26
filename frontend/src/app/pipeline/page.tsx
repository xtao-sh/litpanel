"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Download,
  Upload,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Clock,
  AlertCircle,
  MinusCircle,
  Network,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appConfig } from "@/lib/app-config";
import { getApiUrl, readErrorMessage } from "@/lib/api";
import type { ImportBatch, Library } from "@/lib/types";
import { getStoredActiveLibraryId, resolveInitialLibraryId, setStoredActiveLibraryId } from "@/lib/libraries";

const API_URL = getApiUrl();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredPaper {
  paper_id: string;
  title: string;
  authors: string;
  url: string;
}

interface PipelineStatus {
  agent_db_exists: boolean;
  papers_dir_exists: boolean;
  downloaded_pdfs: number;
  counts: Record<string, number>;
  recent: Array<{
    paper_id: string;
    status: string;
    triage_decision: string | null;
    reading_profile?: string | null;
    updated_at: string | null;
    completed_at: string | null;
  }>;
  timestamp: string;
  error?: string;
}

interface BatchUploadResult {
  batch_id?: number;
  total_files: number;
  imported_files: number;
  skipped_files: number;
  failed_files: number;
  results: Array<{
    filename: string;
    paper_id?: string;
    status?: string;
    error?: string;
  }>;
}

function isPipelineErrorValue(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().startsWith("error:");
}

function summarizeRefreshErrors(result: {
  ingestion?: string;
  embeddings?: unknown;
  error?: string;
  [key: string]: unknown;
} | null): string[] {
  if (!result) return [];

  const messages: string[] = [];
  if (result.error) {
    messages.push(result.error);
  }

  for (const [key, value] of Object.entries(result)) {
    if (key === "error" || value == null) continue;
    if (isPipelineErrorValue(value)) {
      messages.push(`${key}: ${String(value).replace(/^error:\s*/i, "")}`);
    }
  }

  return messages;
}

interface ReadingProfileOption {
  value: string;
  label: string;
  description: string;
}

interface AnalysisFocusOption {
  value: string;
  label: string;
  description: string;
}

type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

const DEFAULT_READING_PROFILE_OPTIONS: ReadingProfileOption[] = [
  {
    value: "auto",
    label: "自动",
    description: "先做初筛，值得展开的论文再进入深度读取。",
  },
  {
    value: "metadata_only",
    label: "仅元数据",
    description: "只登记论文，不运行 AI 阅读。",
  },
  {
    value: "title_abstract",
    label: "标题 + 摘要",
    description: "只生成轻量级摘要和初筛信息。",
  },
  {
    value: "full_content",
    label: "全文内容",
    description: "提取方法、数据、发现等全文信息。",
  },
  {
    value: "style_logic",
    label: "文风 + 逻辑",
    description: "在全文提取基础上额外关注写作风格和论证逻辑。",
  },
];

const DEFAULT_ANALYSIS_FOCUS_OPTIONS: AnalysisFocusOption[] = [
  {
    value: "title_abstract",
    label: "标题与摘要",
    description: "提取论文的标题框架和简明摘要。",
  },
  {
    value: "research_question",
    label: "研究问题",
    description: "关注论文试图回答的核心问题。",
  },
  {
    value: "methods_data",
    label: "方法与数据",
    description: "关注识别策略、方法和数据集。",
  },
  {
    value: "findings",
    label: "发现",
    description: "关注主要结果、结论和贡献。",
  },
  {
    value: "writing_style",
    label: "写作风格",
    description: "关注语气、展开方式和论文写法。",
  },
  {
    value: "argument_logic",
    label: "论证逻辑",
    description: "关注推理链条、假设和因果逻辑。",
  },
];

const READING_PROFILE_LABELS = new Map(
  DEFAULT_READING_PROFILE_OPTIONS.map((option) => [option.value, option])
);
const ANALYSIS_FOCUS_LABELS = new Map(
  DEFAULT_ANALYSIS_FOCUS_OPTIONS.map((option) => [option.value, option])
);

function localizeReadingProfiles(options: ReadingProfileOption[]) {
  return options.map((option) => ({ ...option, ...(READING_PROFILE_LABELS.get(option.value) ?? {}) }));
}

function localizeAnalysisFocuses(options: AnalysisFocusOption[]) {
  return options.map((option) => ({ ...option, ...(ANALYSIS_FOCUS_LABELS.get(option.value) ?? {}) }));
}

// ---------------------------------------------------------------------------
// Status icon helper
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "skipped":
      return <MinusCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <Clock className="h-4 w-4 text-gray-300" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-50 text-green-700 border-green-200";
    case "triaged":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "pending":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "error":
    case "pdf_error":
    case "timeout":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">{value}</span> {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  // --- Discover ---
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoveredPapers, setDiscoveredPapers] = useState<DiscoveredPaper[]>(
    []
  );
  const [discoverError, setDiscoverError] = useState("");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // --- Process by ID ---
  const [paperId, setPaperId] = useState("");
  const [processSteps, setProcessSteps] = useState<
    Record<string, StepStatus>
  >({});
  const [processError, setProcessError] = useState("");

  // --- Upload ---
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPaperId, setUploadPaperId] = useState("");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [uploadResult, setUploadResult] = useState<{
    paper_id?: string;
    status?: string;
    reading_profile?: string;
    error?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchUploadResult | null>(null);
  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [importsLoading, setImportsLoading] = useState(false);
  const [readingProfile, setReadingProfile] = useState("auto");
  const [analysisFocuses, setAnalysisFocuses] = useState<string[]>([
    "research_question",
    "methods_data",
    "findings",
  ]);
  const [readingProfileOptions, setReadingProfileOptions] = useState<ReadingProfileOption[]>(
    DEFAULT_READING_PROFILE_OPTIONS
  );
  const [analysisFocusOptions, setAnalysisFocusOptions] = useState<AnalysisFocusOption[]>(
    DEFAULT_ANALYSIS_FOCUS_OPTIONS
  );

  // --- Pipeline run ---
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<{
    success?: boolean;
    stderr?: string;
    error?: string;
  } | null>(null);

  // --- Refresh ---
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{
    ingestion?: string;
    embeddings?: unknown;
    error?: string;
  } | null>(null);
  const [relationBuilding, setRelationBuilding] = useState(false);
  const [relationResult, setRelationResult] = useState<{
    completed_papers?: number;
    reset_papers?: number;
    linker?: { success?: boolean; stderr?: string };
    error?: string;
  } | null>(null);

  // --- Status ---
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(
    null
  );
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch pipeline status
  // -----------------------------------------------------------------------
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const query = selectedLibraryId ? `?library_id=${selectedLibraryId}` : "";
      const resp = await fetch(`${API_URL}/api/pipeline/status${query}`);
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Failed to load pipeline status"));
      }
      const data = await resp.json();
      setPipelineStatus(data);
      if (data?.error) {
        setStatusError(String(data.error));
      }
    } catch (err) {
      setPipelineStatus(null);
      setStatusError(
        err instanceof Error ? err.message : "Failed to load pipeline status."
      );
    } finally {
      setStatusLoading(false);
    }
  }, [selectedLibraryId]);

  const fetchImportHistory = useCallback(async () => {
    if (!selectedLibraryId) {
      setImportHistory([]);
      return;
    }
    setImportsLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/libraries/${selectedLibraryId}/imports?limit=8`);
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Failed to load import history"));
      }
      const data = await resp.json();
      setImportHistory((data.imports ?? []) as ImportBatch[]);
    } catch {
      setImportHistory([]);
    } finally {
      setImportsLoading(false);
    }
  }, [selectedLibraryId]);

  const loadLibraries = useCallback(async () => {
    const resp = await fetch(`${API_URL}/api/libraries`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const nextLibraries = (data.libraries ?? []) as Library[];
    setLibraries(nextLibraries);
    const initial = resolveInitialLibraryId(nextLibraries) ?? getStoredActiveLibraryId();
    setSelectedLibraryId(initial);
    setStoredActiveLibraryId(initial);
    return nextLibraries;
  }, []);

  const fetchPipelineOptions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/options`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data.reading_profiles) && data.reading_profiles.length > 0) {
        setReadingProfileOptions(localizeReadingProfiles(data.reading_profiles as ReadingProfileOption[]));
      }
      if (Array.isArray(data.analysis_focuses) && data.analysis_focuses.length > 0) {
        setAnalysisFocusOptions(localizeAnalysisFocuses(data.analysis_focuses as AnalysisFocusOption[]));
      }
    } catch {
      // ignore and keep defaults
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchImportHistory();
  }, [fetchImportHistory]);

  useEffect(() => {
    fetchPipelineOptions();
  }, [fetchPipelineOptions]);

  useEffect(() => {
    let active = true;
    async function initializeLibraries() {
      try {
        if (!active) return;
        await loadLibraries();
      } catch {
        // ignore
      }
    }
    initializeLibraries();
    return () => {
      active = false;
    };
  }, [loadLibraries]);

  const selectedLibrary =
    libraries.find((library) => library.id === selectedLibraryId) ?? null;
  const selectedReadingProfile =
    readingProfileOptions.find((option) => option.value === readingProfile) ?? null;
  const refreshErrors = summarizeRefreshErrors(refreshResult);

  const toggleAnalysisFocus = (focus: string, checked: boolean) => {
    setAnalysisFocuses((prev) => {
      if (checked) {
        return prev.includes(focus) ? prev : [...prev, focus];
      }
      return prev.filter((item) => item !== focus);
    });
  };

  const serializeFocuses = () => JSON.stringify(analysisFocuses);
  const getAgentStepStatus = (step?: { success?: boolean; skipped?: boolean } | null): StepStatus => {
    if (!step) return "idle";
    if (step.skipped) return "skipped";
    return step.success ? "done" : "error";
  };

  // -----------------------------------------------------------------------
  // Discover
  // -----------------------------------------------------------------------
  const handleDiscover = async () => {
    setDiscoverLoading(true);
    setDiscoverError("");
    setDiscoveredPapers([]);
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/discover?limit=20`, {
        method: "POST",
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        throw new Error(detail?.detail ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setDiscoveredPapers(data.new_papers ?? []);
    } catch (err) {
      setDiscoverError(
        err instanceof Error ? err.message : "Failed to discover papers"
      );
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleProcessDiscovered = async (pid: string) => {
    setProcessingIds((prev) => new Set(prev).add(pid));
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_id: pid,
          library_id: selectedLibraryId,
          reading_profile: readingProfile,
          analysis_focuses: analysisFocuses,
        }),
      });
      if (resp.ok) {
        setProcessedIds((prev) => new Set(prev).add(pid));
        fetchStatus();
        loadLibraries();
      }
    } catch {
      // ignore
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }
  };

  // -----------------------------------------------------------------------
  // Process by ID
  // -----------------------------------------------------------------------
  const handleProcessById = async () => {
    const id = paperId.trim();
    if (!id) return;

    setProcessError("");
    setProcessSteps({
      download: "running",
      register: "idle",
      scout: "idle",
      reader: "idle",
      refresh: "idle",
    });

    try {
      const resp = await fetch(`${API_URL}/api/pipeline/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_id: id,
          library_id: selectedLibraryId,
          reading_profile: readingProfile,
          analysis_focuses: analysisFocuses,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        throw new Error(detail?.detail ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      // Map response to step statuses
      setProcessSteps({
        download: data.download?.status === "ok" ? "done" : "error",
        register: data.registered ? "done" : "error",
        scout: getAgentStepStatus(data.scout),
        reader: getAgentStepStatus(data.reader),
        refresh: data.refresh?.ingestion === "ok" ? "done" : data.refresh ? "error" : "idle",
      });

      if (data.download?.status === "error") {
        setProcessError(data.download.error ?? "Download failed");
      }
    } catch (err) {
      setProcessError(
        err instanceof Error ? err.message : "Processing failed"
      );
      setProcessSteps((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (next[k] === "running" || next[k] === "idle") next[k] = "error";
        }
        return next;
      });
    }
  };

  // -----------------------------------------------------------------------
  // Upload
  // -----------------------------------------------------------------------
  const handleUpload = async () => {
    if (!uploadFile) return;

    // 50 MB limit
    if (uploadFile.size > 50 * 1024 * 1024) {
      setUploadError("File too large. Maximum is 50 MB.");
      return;
    }

    setUploadStatus("uploading");
    setUploadError("");
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (selectedLibraryId) {
      formData.append("library_id", String(selectedLibraryId));
    }
    if (uploadPaperId.trim()) {
      formData.append("paper_id", uploadPaperId.trim());
    }
    formData.append("reading_profile", readingProfile);
    formData.append("analysis_focuses", serializeFocuses());

    try {
      const resp = await fetch(`${API_URL}/api/pipeline/upload`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) {
        setUploadStatus("error");
        setUploadError(data.error);
      } else {
        setUploadStatus("done");
        setUploadResult(data);
        fetchStatus();
        fetchImportHistory();
        loadLibraries();
      }
    } catch (err) {
      setUploadStatus("error");
      setUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
    }
  };

  const handleFolderUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedLibraryId) return;

    setBatchUploading(true);
    setBatchResult(null);
    setUploadError("");

    const formData = new FormData();
    formData.append("library_id", String(selectedLibraryId));
    formData.append("reading_profile", readingProfile);
    formData.append("analysis_focuses", serializeFocuses());
    Array.from(files)
      .filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
      .forEach((file) => {
        formData.append("files", file);
      });

    try {
      const resp = await fetch(`${API_URL}/api/pipeline/upload-batch`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.detail ?? `HTTP ${resp.status}`);
      setBatchResult(data);
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Batch upload failed");
    } finally {
      setBatchUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setUploadFile(file);
      setUploadStatus("idle");
      setUploadError("");
      setUploadResult(null);
    }
  };

  // -----------------------------------------------------------------------
  // Pipeline run
  // -----------------------------------------------------------------------
  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    setPipelineResult(null);
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "full-cycle",
          batch_size: 10,
          library_id: selectedLibraryId,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setPipelineResult(data);
    } catch (err) {
      setPipelineResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setPipelineRunning(false);
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    }
  };

  // -----------------------------------------------------------------------
  // Refresh website DB
  // -----------------------------------------------------------------------
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const query = selectedLibraryId ? `?library_id=${selectedLibraryId}` : "";
      const resp = await fetch(`${API_URL}/api/pipeline/refresh${query}`, {
        method: "POST",
      });
      if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Failed to refresh the indexed database"));
      }
      const data = await resp.json();
      setRefreshResult(data);
    } catch (err) {
      setRefreshResult({
        error: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setRefreshing(false);
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    }
  };

  const handleBuildRelations = async () => {
    setRelationBuilding(true);
    setRelationResult(null);
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/build-relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: selectedLibraryId,
          force_rebuild: true,
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      setRelationResult(data);
    } catch (err) {
      setRelationResult({
        error: err instanceof Error ? err.message : "Failed to build relations",
      });
    } finally {
      setRelationBuilding(false);
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          导入中心
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          导入、同步并处理 PDF 到本地知识库
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          AI 模型和流程路由可以在设置页配置。
        </p>
      </div>

      {libraries.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/70 px-4 py-3">
          <span className="text-sm font-medium text-foreground">目标文献库</span>
          <select
            value={selectedLibraryId ?? ""}
            onChange={(event) => {
              const nextId = Number(event.target.value) || null;
              setSelectedLibraryId(nextId);
              setStoredActiveLibraryId(nextId);
            }}
            className="h-10 min-w-[220px] rounded-xl border border-border bg-background px-3 text-sm text-foreground"
          >
            {libraries.map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            导入内容会写入当前选择的文献库。
          </span>
        </div>
      )}

      {!appConfig.supportsRemoteDiscovery && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          当前工作区未启用远程发现。请通过 PDF 上传建立本地文献库。
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            AI 阅读设置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">阅读方案</p>
              <Select value={readingProfile} onValueChange={setReadingProfile}>
                <SelectTrigger>
                  <SelectValue placeholder="选择阅读方案" />
                </SelectTrigger>
                <SelectContent>
                  {readingProfileOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedReadingProfile?.description ??
                  "该方案控制新论文进入知识库前的读取深度。"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">分析重点</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {analysisFocusOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex gap-3 rounded-xl border border-border bg-background/70 p-3"
                  >
                    <Checkbox
                      checked={analysisFocuses.includes(option.value)}
                      onCheckedChange={(checked) =>
                        toggleAnalysisFocus(option.value, checked === true)
                      }
                      className="mt-0.5"
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Section 1: Pipeline Status */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            文献库内容状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedLibrary ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {selectedLibrary.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedLibrary.discipline || "未分类"} · {selectedLibrary.paper_count} 篇论文
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SummaryPill label="地图" value={selectedLibrary.field_map_count} />
                <SummaryPill label="想法" value={selectedLibrary.idea_count} />
                <SummaryPill label="摘要" value={selectedLibrary.digest_count} />
                <SummaryPill label="导入批次" value={selectedLibrary.import_batch_count} />
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                <p>
                  最新摘要：<span className="font-medium text-foreground">{selectedLibrary.latest_digest_date ?? "无"}</span>
                </p>
                <p>
                  最新想法：<span className="font-medium text-foreground">{selectedLibrary.latest_idea_date ?? "无"}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                用这里检查当前文献库是否已有地图、想法、摘要和导入记录。
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              选择文献库后查看内容状态。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              流程状态
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchStatus}
              disabled={statusLoading}
            >
              {statusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {statusError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {statusError}
            </div>
          )}
          {pipelineStatus ? (
            <div className="space-y-4">
              {/* Count badges */}
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "总数", key: "total", color: "bg-gray-100 text-gray-800" },
                  { label: "待处理", key: "pending", color: "bg-yellow-100 text-yellow-800" },
                  { label: "已分流", key: "triaged", color: "bg-blue-100 text-blue-800" },
                  { label: "已完成", key: "completed", color: "bg-green-100 text-green-800" },
                  { label: "错误", key: "error", color: "bg-red-100 text-red-800" },
                  { label: "深度读取", key: "triage_DEEP_READ", color: "bg-indigo-100 text-indigo-800" },
                  { label: "略读", key: "triage_SKIM", color: "bg-slate-100 text-slate-700" },
                  { label: "跳过", key: "triage_SKIP", color: "bg-gray-50 text-gray-500" },
                ].map(({ label, key, color }) => (
                  <div
                    key={key}
                    className={`rounded-lg px-3 py-2 text-center ${color}`}
                  >
                    <div className="text-lg font-bold">
                      {pipelineStatus.counts[key] ?? 0}
                    </div>
                    <div className="text-xs">{label}</div>
                  </div>
                ))}
              </div>

              {/* Downloaded PDFs */}
              <p className="text-xs text-gray-500">
                本地已缓存 {pipelineStatus.downloaded_pdfs} 个 PDF
                {pipelineStatus.timestamp && (
                  <> &middot; 最近检查 {new Date(pipelineStatus.timestamp).toLocaleTimeString()}</>
                )}
              </p>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleRunPipeline}
                  disabled={pipelineRunning}
                  className="gap-2"
                >
                  {pipelineRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  运行完整流程
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="gap-2"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  刷新网站数据库
                </Button>
              </div>

              {/* Pipeline run result */}
              {pipelineResult && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    pipelineResult.success
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <p className="font-medium">
                    流程{pipelineResult.success ? "已完成" : "失败"}
                  </p>
                  {pipelineResult.stderr ? (
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs opacity-80">
                      {pipelineResult.stderr.slice(0, 500)}
                    </pre>
                  ) : null}
                </div>
              )}

              {/* Refresh result */}
              {refreshResult && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    refreshErrors.length > 0
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-blue-200 bg-blue-50 text-blue-800"
                  }`}
                >
                  <p className="font-medium">刷新结果</p>
                  {refreshErrors.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs">
                      {refreshErrors.map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                    </div>
                  ) : null}
                  <pre className="mt-1 whitespace-pre-wrap text-xs opacity-80">
                    {JSON.stringify(refreshResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载状态……
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              最近导入
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchImportHistory}
              disabled={importsLoading || !selectedLibraryId}
            >
              {importsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedLibraryId ? (
            <p className="text-sm text-muted-foreground">选择文献库后查看导入历史。</p>
          ) : importsLoading && importHistory.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载导入历史……
            </div>
          ) : importHistory.length > 0 ? (
            <div className="space-y-3">
              {importHistory.map((batch) => (
                <div key={batch.id} className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {batch.source_label || batch.source_type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(batch.created_at).toLocaleString()} · {batch.source_type}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{batch.total_files} 个文件</Badge>
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {batch.imported_files} 已导入
                      </Badge>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                        {batch.skipped_files} 已跳过
                      </Badge>
                      <Badge className="bg-red-100 text-red-700 border-red-200">
                        {batch.failed_files} 失败
                      </Badge>
                    </div>
                  </div>
                  {batch.files.length > 0 && (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-muted/30 p-3">
                      {batch.files.slice(0, 6).map((file) => (
                        <div key={file.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-foreground">{file.filename}</span>
                          <span className="shrink-0 text-muted-foreground">{file.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              这个文献库还没有导入历史。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            建立 AI 论文关联
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            在论文读取完成后，为当前文献库重新建立跨论文关系，并刷新后续地图和图谱数据。
          </p>
          <div className="flex gap-3">
            <Button
              onClick={handleBuildRelations}
              disabled={relationBuilding || !selectedLibraryId}
              className="gap-2"
            >
              {relationBuilding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Network className="h-4 w-4" />
              )}
              建立 AI 关联
            </Button>
          </div>

          {relationResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                relationResult.error || relationResult.linker?.success === false
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
              }`}
            >
              {relationResult.error ? (
                <p className="font-medium">{relationResult.error}</p>
              ) : (
                <>
                  <p className="font-medium">
                    已处理 {relationResult.completed_papers ?? 0} 篇完成读取的论文
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    已重置 {relationResult.reset_papers ?? 0} 篇论文用于重新建立关联。
                  </p>
                  {relationResult.linker?.stderr ? (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs opacity-80">
                      {relationResult.linker.stderr.slice(0, 500)}
                    </pre>
                  ) : null}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Section 2: Discover New Papers */}
      {/* ================================================================ */}
      {appConfig.supportsRemoteDiscovery && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            从 {appConfig.remoteDiscoveryLabel} 同步
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              onClick={handleDiscover}
              disabled={discoverLoading}
              className="gap-2"
            >
              {discoverLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              检查新论文
            </Button>
          </div>

          {discoverError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {discoverError}
            </div>
          )}

          {discoveredPapers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                找到 {discoveredPapers.length} 篇新论文
              </p>
              <div className="divide-y rounded-lg border">
                {discoveredPapers.map((paper) => (
                  <div
                    key={paper.paper_id}
                    className="flex items-start justify-between gap-4 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0 font-mono text-xs">
                          {paper.paper_id}
                        </Badge>
                        {processedIds.has(paper.paper_id) && (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            已处理
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900 truncate">
                        {paper.title || "未命名"}
                      </p>
                      {paper.authors && (
                        <p className="text-xs text-gray-500 truncate">
                          {paper.authors}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={
                        processingIds.has(paper.paper_id) ||
                        processedIds.has(paper.paper_id)
                      }
                      onClick={() =>
                        handleProcessDiscovered(paper.paper_id)
                      }
                    >
                      {processingIds.has(paper.paper_id) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      处理
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!discoverLoading &&
            discoveredPapers.length === 0 &&
            !discoverError && (
              <p className="text-sm text-gray-400">
                点击按钮检查 {appConfig.remoteDiscoveryLabel} 是否有新论文。
              </p>
            )}
        </CardContent>
      </Card>
      )}

      {/* ================================================================ */}
      {/* Section 3: Process by ID */}
      {/* ================================================================ */}
      {appConfig.supportsRemoteDiscovery && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            按论文 ID 处理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            这个操作会使用当前 AI 阅读设置：
            <span className="font-medium text-foreground">{selectedReadingProfile?.label ?? "自动"}</span>。
          </p>
          <div className="flex gap-3">
            <Input
              placeholder="e.g. w35000"
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
              className="max-w-xs font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleProcessById();
              }}
            />
            <Button
              onClick={handleProcessById}
              disabled={
                !paperId.trim() ||
                Object.values(processSteps).some((s) => s === "running")
              }
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              下载并处理
            </Button>
          </div>

          {/* Progress steps */}
          {Object.keys(processSteps).length > 0 && (
            <div className="space-y-2">
              {[
                { key: "download", label: "下载 PDF" },
                { key: "register", label: "登记到 Agent 数据库" },
                { key: "scout", label: "初筛分流" },
                { key: "reader", label: "深度读取" },
                { key: "refresh", label: "刷新网站数据库" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <StatusIcon
                    status={processSteps[key] ?? "idle"}
                  />
                  <span
                    className={
                      processSteps[key] === "done"
                        ? "text-gray-900"
                        : processSteps[key] === "error"
                          ? "text-red-600"
                          : processSteps[key] === "skipped"
                            ? "text-gray-400"
                          : "text-gray-500"
                    }
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {processError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {processError}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ================================================================ */}
      {/* Section 4: Upload PDF */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            上传 PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            新上传的论文会保存当前 AI 阅读设置，后续流程会按这个方案处理。
          </p>
          {/* Drop zone */}
          <div
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              isDragging
                ? "border-blue-400 bg-blue-50"
                : uploadFile
                  ? "border-green-300 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setUploadFile(file);
                  setUploadStatus("idle");
                  setUploadError("");
                  setUploadResult(null);
                }
              }}
            />
            {uploadFile ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <FileText className="h-5 w-5" />
                <span className="font-medium">{uploadFile.name}</span>
                <span className="text-green-500">
                  ({(uploadFile.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  拖入 PDF，或点击选择文件
                </p>
                <p className="mt-1 text-xs text-gray-400">最大 50 MB</p>
              </div>
            )}
          </div>

          {/* Optional paper ID + upload button */}
          <div className="flex gap-3">
            <Input
              placeholder="论文 ID（可选，例如 w35000）"
              value={uploadPaperId}
              onChange={(e) => setUploadPaperId(e.target.value)}
              className="max-w-xs font-mono"
            />
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || uploadStatus === "uploading"}
              className="gap-2"
            >
              {uploadStatus === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              上传并登记
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={batchUploading || !selectedLibraryId}
              className="gap-2"
            >
              {batchUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              导入文件夹
            </Button>
            <input
              ref={folderInputRef}
              type="file"
              multiple
              accept=".pdf"
              className="hidden"
              {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
              onChange={(e) => {
                void handleFolderUpload(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {/* Upload result */}
          {uploadStatus === "done" && uploadResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <p className="font-medium">上传成功</p>
              <p className="mt-1 text-xs">
                论文 ID：<span className="font-mono">{uploadResult.paper_id ?? ""}</span>
                {" "}&middot; 状态：{uploadResult.status ?? ""}
              </p>
              {uploadResult.reading_profile ? (
                <p className="mt-1 text-xs">
                  阅读方案：<span className="font-medium">{uploadResult.reading_profile}</span>
                </p>
              ) : null}
            </div>
          )}
          {uploadError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}
          {batchResult && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <p className="font-medium">
                批量导入完成：{batchResult.imported_files} 个已导入，{batchResult.skipped_files} 个已跳过，{batchResult.failed_files} 个失败
              </p>
              <div className="mt-2 max-h-40 overflow-auto space-y-1 text-xs">
                {batchResult.results.map((item) => (
                  <div key={`${item.filename}-${item.paper_id ?? ""}`} className="flex items-center justify-between gap-3">
                    <span className="truncate">{item.filename}</span>
                    <span className="shrink-0 font-medium">{item.status ?? "未知"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Section 5: Recent Activity */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            最近活动
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pipelineStatus?.recent && pipelineStatus.recent.length > 0 ? (
            <div className="divide-y rounded-lg border">
              {pipelineStatus.recent.map((paper) => (
                <div
                  key={paper.paper_id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm text-gray-700">
                      {paper.paper_id}
                    </span>
                    <Badge
                      variant="outline"
                      className={statusColor(paper.status)}
                    >
                      {paper.status}
                    </Badge>
                    {paper.triage_decision && (
                      <Badge variant="outline" className="text-xs">
                        {paper.triage_decision}
                      </Badge>
                    )}
                    {paper.reading_profile && (
                      <Badge variant="outline" className="text-xs">
                        {paper.reading_profile}
                      </Badge>
                    )}
                  </div>
                  {paper.updated_at && (
                    <span className="shrink-0 text-xs text-gray-400">
                      {new Date(paper.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无最近活动。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
