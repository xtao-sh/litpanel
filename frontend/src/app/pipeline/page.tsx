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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8011";

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
    updated_at: string | null;
    completed_at: string | null;
  }>;
  timestamp: string;
  error?: string;
}

type StepStatus = "idle" | "running" | "done" | "error";

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
    error?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // --- Status ---
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(
    null
  );
  const [statusLoading, setStatusLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch pipeline status
  // -----------------------------------------------------------------------
  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/status`);
      if (resp.ok) {
        const data = await resp.json();
        setPipelineStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // -----------------------------------------------------------------------
  // Discover
  // -----------------------------------------------------------------------
  const handleDiscover = async () => {
    setDiscoverLoading(true);
    setDiscoverError("");
    setDiscoveredPapers([]);
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
        body: JSON.stringify({ paper_id: pid }),
      });
      if (resp.ok) {
        setProcessedIds((prev) => new Set(prev).add(pid));
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
        body: JSON.stringify({ paper_id: id }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // Map response to step statuses
      setProcessSteps({
        download: data.download?.status === "ok" ? "done" : "error",
        register: data.registered ? "done" : "error",
        scout: data.scout?.success ? "done" : data.scout ? "error" : "idle",
        reader: data.reader?.success
          ? "done"
          : data.reader
            ? "error"
            : "idle",
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
    if (uploadPaperId.trim()) {
      formData.append("paper_id", uploadPaperId.trim());
    }

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
      }
    } catch (err) {
      setUploadStatus("error");
      setUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
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
        body: JSON.stringify({ agent: "full-cycle", batch_size: 10 }),
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
    }
  };

  // -----------------------------------------------------------------------
  // Refresh website DB
  // -----------------------------------------------------------------------
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/refresh`, {
        method: "POST",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setRefreshResult(data);
    } catch (err) {
      setRefreshResult({
        error: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setRefreshing(false);
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
          Paper Pipeline
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover, download, and process new NBER working papers
        </p>
      </div>

      {/* ================================================================ */}
      {/* Section 1: Pipeline Status */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Pipeline Status
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
          {pipelineStatus ? (
            <div className="space-y-4">
              {/* Count badges */}
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Total", key: "total", color: "bg-gray-100 text-gray-800" },
                  { label: "Pending", key: "pending", color: "bg-yellow-100 text-yellow-800" },
                  { label: "Triaged", key: "triaged", color: "bg-blue-100 text-blue-800" },
                  { label: "Completed", key: "completed", color: "bg-green-100 text-green-800" },
                  { label: "Errors", key: "error", color: "bg-red-100 text-red-800" },
                  { label: "Deep Read", key: "triage_DEEP_READ", color: "bg-indigo-100 text-indigo-800" },
                  { label: "Skim", key: "triage_SKIM", color: "bg-slate-100 text-slate-700" },
                  { label: "Skip", key: "triage_SKIP", color: "bg-gray-50 text-gray-500" },
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
                {pipelineStatus.downloaded_pdfs} PDFs cached locally
                {pipelineStatus.timestamp && (
                  <> &middot; Last checked {new Date(pipelineStatus.timestamp).toLocaleTimeString()}</>
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
                  Run Full Pipeline
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
                  Refresh Website DB
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
                    Pipeline {pipelineResult.success ? "completed" : "failed"}
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
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <p className="font-medium">Refresh result</p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs opacity-80">
                    {JSON.stringify(refreshResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading status...
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Section 2: Discover New Papers */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Discover New Papers
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
              Check for New Papers
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
                {discoveredPapers.length} new paper
                {discoveredPapers.length !== 1 ? "s" : ""} found
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
                            Processed
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900 truncate">
                        {paper.title || "Untitled"}
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
                      Process
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
                Click the button to check the NBER API for new papers.
              </p>
            )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Section 3: Process by ID */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Process by Paper ID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              Download &amp; Process
            </Button>
          </div>

          {/* Progress steps */}
          {Object.keys(processSteps).length > 0 && (
            <div className="space-y-2">
              {[
                { key: "download", label: "Download PDF" },
                { key: "register", label: "Register in agent DB" },
                { key: "scout", label: "Scout triage" },
                { key: "reader", label: "Reader deep-read" },
                { key: "refresh", label: "Refresh website DB" },
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

      {/* ================================================================ */}
      {/* Section 4: Upload PDF */}
      {/* ================================================================ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Upload PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  Drag and drop a PDF here, or click to browse
                </p>
                <p className="mt-1 text-xs text-gray-400">Max 50 MB</p>
              </div>
            )}
          </div>

          {/* Optional paper ID + upload button */}
          <div className="flex gap-3">
            <Input
              placeholder="Paper ID (optional, e.g. w35000)"
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
              Upload &amp; Register
            </Button>
          </div>

          {/* Upload result */}
          {uploadStatus === "done" && uploadResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <p className="font-medium">Upload successful</p>
              <p className="mt-1 text-xs">
                Paper ID: <span className="font-mono">{uploadResult.paper_id ?? ""}</span>
                {" "}&middot; Status: {uploadResult.status ?? ""}
              </p>
            </div>
          )}
          {uploadError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {uploadError}
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
            Recent Activity
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
            <p className="text-sm text-gray-400">No recent activity.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
