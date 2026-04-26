"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import {
  Database,
  Download,
  FileStack,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

import { GET_STATS } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AIProviderCatalogItem,
  AIProviderSetting,
  AIStepCatalogItem,
  AIStepConfig,
  Library,
} from "@/lib/types";
import { getApiUrl } from "@/lib/api";
import { resolveInitialLibraryId, setStoredActiveLibraryId } from "@/lib/libraries";
import { useI18n } from "@/lib/i18n/locale-context";

const API_URL = getApiUrl();

interface AppRuntimeConfig {
  app_name: string;
  app_description: string;
  source_name: string;
  source_paper_label: string;
  remote_discovery_label: string;
  supports_remote_discovery: boolean;
  remote_source_kind: string;
  export_basename: string;
  kb_db_path: string;
  knowledge_base_dir: string;
  papers_dir: string;
  projects_dir: string;
  agent_db_path: string;
}

interface PipelineStatus {
  supports_remote_discovery: boolean;
  remote_source_kind: string;
  remote_source_name: string;
  agent_db_exists: boolean;
  agent_db_path: string;
  papers_dir: string;
  papers_dir_exists: boolean;
  downloaded_pdfs: number;
  counts: Record<string, number>;
  timestamp: string;
  error?: string;
}

interface StatsQuery {
  stats: {
    totalPapers: number;
    totalCards: number;
    totalAtoms: number;
    totalIdeas: number;
  };
}

interface AISettingsResponse {
  providers: AIProviderCatalogItem[];
  steps: AIStepCatalogItem[];
  provider_settings: AIProviderSetting[];
  step_configs: AIStepConfig[];
}

function PathBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-xs leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span> {label}
    </div>
  );
}

export default function SetupPage() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AppRuntimeConfig | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [newLibraryName, setNewLibraryName] = useState("");
  const [newLibraryDiscipline, setNewLibraryDiscipline] = useState("");
  const [creatingLibrary, setCreatingLibrary] = useState(false);
  const [editingLibraryId, setEditingLibraryId] = useState<number | null>(null);
  const [editingLibraryName, setEditingLibraryName] = useState("");
  const [editingLibraryDiscipline, setEditingLibraryDiscipline] = useState("");
  const [editingLibraryDescription, setEditingLibraryDescription] = useState("");
  const [savingLibraryId, setSavingLibraryId] = useState<number | null>(null);
  const [deletingLibraryId, setDeletingLibraryId] = useState<number | null>(null);
  const [reindexingLibraryId, setReindexingLibraryId] = useState<number | null>(null);
  const [exportingLibraryId, setExportingLibraryId] = useState<number | null>(null);
  const [importingLibrary, setImportingLibrary] = useState(false);
  const [importInputKey, setImportInputKey] = useState(0);
  const [aiProviders, setAiProviders] = useState<AIProviderCatalogItem[]>([]);
  const [aiSteps, setAiSteps] = useState<AIStepCatalogItem[]>([]);
  const [providerSettings, setProviderSettings] = useState<AIProviderSetting[]>([]);
  const [stepConfigs, setStepConfigs] = useState<AIStepConfig[]>([]);
  const [selectedProviderKey, setSelectedProviderKey] = useState("");
  const [singleStepRouting, setSingleStepRouting] = useState(true);
  const [singleStepProvider, setSingleStepProvider] = useState("");
  const [singleStepModel, setSingleStepModel] = useState("");
  const [savingAI, setSavingAI] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerTestResults, setProviderTestResults] = useState<Record<string, string>>({});

  const { data: statsData, refetch: refetchStats } = useQuery<StatsQuery>(GET_STATS);

  const loadLibraries = useCallback(async () => {
    const resp = await fetch(`${API_URL}/api/libraries`);
    if (!resp.ok) {
      throw new Error(t("setup.messages.failedLoadLibraries"));
    }
    const data = await resp.json();
    const nextLibraries = (data.libraries ?? []) as Library[];
    setLibraries(nextLibraries);
    return nextLibraries;
  }, [t]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [configResp, statusResp, aiResp] = await Promise.all([
          fetch(`${API_URL}/api/config`),
          fetch(`${API_URL}/api/pipeline/status`),
          fetch(`${API_URL}/api/ai/settings`),
        ]);

        if (!configResp.ok || !statusResp.ok || !aiResp.ok) {
          throw new Error(t("setup.messages.failedLoadSetup"));
        }

        const [configJson, statusJson, aiJson, librariesJson] = await Promise.all([
          configResp.json(),
          statusResp.json(),
          aiResp.json(),
          fetch(`${API_URL}/api/libraries`).then((resp) =>
            resp.ok ? resp.json() : Promise.resolve({ libraries: [] })
          ),
        ]);

        if (!active) return;
        setConfig(configJson);
        setStatus(statusJson);
        setAiProviders((aiJson as AISettingsResponse).providers ?? []);
        setAiSteps((aiJson as AISettingsResponse).steps ?? []);
        setProviderSettings((aiJson as AISettingsResponse).provider_settings ?? []);
        setStepConfigs((aiJson as AISettingsResponse).step_configs ?? []);
        setLibraries(librariesJson.libraries ?? []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t("setup.messages.failedLoadSetup"));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [t]);

  const totalPapers = statsData?.stats.totalPapers ?? 0;
  const defaultLibraryId = libraries[0]?.id ?? null;
  const activeLibraryId = resolveInitialLibraryId(libraries);
  const activeLibrary = libraries.find((library) => library.id === activeLibraryId) ?? null;

  const providerCatalogMap = useMemo(
    () => new Map(aiProviders.map((provider) => [provider.key, provider])),
    [aiProviders]
  );

  const providerSettingMap = useMemo(
    () => new Map(providerSettings.map((provider) => [provider.provider, provider])),
    [providerSettings]
  );

  const stepConfigMap = useMemo(
    () => new Map(stepConfigs.map((step) => [step.step, step])),
    [stepConfigs]
  );

  const activeProviderKey = selectedProviderKey || aiProviders[0]?.key || "";
  const activeProvider = aiProviders.find((provider) => provider.key === activeProviderKey);
  const activeProviderSetting = activeProvider
    ? providerSettingMap.get(activeProvider.key) ?? {
        provider: activeProvider.key,
        label: activeProvider.label,
        api_style: activeProvider.api_style,
        base_url: activeProvider.default_base_url,
        api_key: "",
        api_key_hint: "",
        has_key: false,
        default_model: activeProvider.default_model,
        enabled: false,
      }
    : null;
  const configuredProviderCount = providerSettings.filter(
    (provider) => provider.enabled || provider.has_key
  ).length;
  const enabledProviders = providerSettings.filter((provider) => provider.enabled);
  const defaultStepProvider =
    singleStepProvider ||
    stepConfigs[0]?.provider ||
    aiSteps[0]?.default_provider ||
    aiProviders[0]?.key ||
    "";
  const defaultStepModel = singleStepModel || stepConfigs[0]?.model || "";

  function updateProviderSetting(providerKey: string, patch: Partial<AIProviderSetting>) {
    setProviderSettings((prev) =>
      prev.map((item) => (item.provider === providerKey ? { ...item, ...patch } : item))
    );
  }

  function updateStepConfig(stepKey: string, patch: Partial<AIStepConfig>) {
    setStepConfigs((prev) =>
      prev.some((item) => item.step === stepKey)
        ? prev.map((item) => (item.step === stepKey ? { ...item, ...patch } : item))
        : [
            ...prev,
            {
              step: stepKey,
              provider:
                patch.provider ??
                aiSteps.find((step) => step.key === stepKey)?.default_provider ??
                aiProviders[0]?.key ??
                "",
              model: patch.model ?? "",
            },
          ]
    );
  }

  function applySingleStepRouting(providerKey: string, model: string) {
    setSingleStepProvider(providerKey);
    setSingleStepModel(model);
    setStepConfigs((prev) => {
      const prevMap = new Map(prev.map((item) => [item.step, item]));
      return aiSteps.map((step) => {
        const current = prevMap.get(step.key);
        return {
          step: step.key,
          provider: providerKey || current?.provider || step.default_provider,
          model,
        };
      });
    });
  }

  async function handleSaveAISettings() {
    setSavingAI(true);
    setError("");
    setStatusMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/ai/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_settings: providerSettings,
          step_configs: stepConfigs,
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.failedSaveAI"));
      }
      setAiProviders(data.providers ?? []);
      setAiSteps(data.steps ?? []);
      setProviderSettings(data.provider_settings ?? []);
      setStepConfigs(data.step_configs ?? []);
      setStatusMessage(t("setup.messages.savedAI"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedSaveAI"));
    } finally {
      setSavingAI(false);
    }
  }

  async function handleTestProvider(providerKey: string) {
    const setting = providerSettingMap.get(providerKey);
    if (!setting) return;
    setTestingProvider(providerKey);
    setProviderTestResults((prev) => ({ ...prev, [providerKey]: "" }));
    try {
      const resp = await fetch(`${API_URL}/api/ai/providers/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerKey,
          base_url: setting.base_url,
          api_key: setting.api_key,
          default_model: setting.default_model,
          clear_api_key: Boolean(setting.clear_api_key),
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.providerTestFailed"));
      }
      setProviderTestResults((prev) => ({
        ...prev,
        [providerKey]: t("setup.messages.connectedWith", { model: data.model }),
      }));
    } catch (err) {
      setProviderTestResults((prev) => ({
        ...prev,
        [providerKey]: err instanceof Error ? err.message : t("setup.messages.providerTestFailed"),
      }));
    } finally {
      setTestingProvider(null);
    }
  }

  async function handleCreateLibrary() {
    if (!newLibraryName.trim()) return;
    setCreatingLibrary(true);
    setError("");
    setStatusMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/libraries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLibraryName.trim(),
          discipline: newLibraryDiscipline.trim(),
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.failedCreateLibrary"));
      }
      const nextLibraries = await loadLibraries();
      const activeLibraryId = resolveInitialLibraryId(nextLibraries);
      setStoredActiveLibraryId(activeLibraryId);
      setNewLibraryName("");
      setNewLibraryDiscipline("");
      setStatusMessage(t("setup.messages.createdLibrary", { name: data.library.name }));
      void refetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedCreateLibrary"));
    } finally {
      setCreatingLibrary(false);
    }
  }

  function handleStartEdit(library: Library) {
    setEditingLibraryId(library.id);
    setEditingLibraryName(library.name);
    setEditingLibraryDiscipline(library.discipline ?? "");
    setEditingLibraryDescription(library.description ?? "");
    setError("");
    setStatusMessage("");
  }

  function handleCancelEdit() {
    setEditingLibraryId(null);
    setEditingLibraryName("");
    setEditingLibraryDiscipline("");
    setEditingLibraryDescription("");
  }

  async function handleSaveLibrary(libraryId: number) {
    if (!editingLibraryName.trim()) return;
    setSavingLibraryId(libraryId);
    setError("");
    setStatusMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/libraries/${libraryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingLibraryName.trim(),
          discipline: editingLibraryDiscipline.trim(),
          description: editingLibraryDescription.trim(),
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.failedUpdateLibrary"));
      }
      const updatedLibrary = data.library as Library;
      await loadLibraries();
      setStatusMessage(t("setup.messages.updatedLibrary", { name: updatedLibrary.name }));
      handleCancelEdit();
      void refetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedUpdateLibrary"));
    } finally {
      setSavingLibraryId(null);
    }
  }

  async function handleDeleteLibrary(library: Library) {
    const confirmed = window.confirm(
      t("setup.messages.deleteConfirm", { name: library.name })
    );
    if (!confirmed) return;

    setDeletingLibraryId(library.id);
    setError("");
    setStatusMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/libraries/${library.id}`, {
        method: "DELETE",
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.failedDeleteLibrary"));
      }
      const nextLibraries = libraries.filter((item) => item.id !== library.id);
      setLibraries(nextLibraries);
      const nextActiveId = resolveInitialLibraryId(nextLibraries);
      setStoredActiveLibraryId(nextActiveId);
      if (editingLibraryId === library.id) {
        handleCancelEdit();
      }
      setStatusMessage(t("setup.messages.deletedLibrary", { name: library.name }));
      void refetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedDeleteLibrary"));
    } finally {
      setDeletingLibraryId(null);
    }
  }

  async function handleReindexLibrary(library: Library) {
    setReindexingLibraryId(library.id);
    setError("");
    setStatusMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/libraries/${library.id}/reindex`, {
        method: "POST",
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.failedReindexLibrary"));
      }
      await loadLibraries();
      const result = data?.result;
      const ingestion = result?.ingestion ?? "ok";
      setStatusMessage(t("setup.messages.reindexedLibrary", { name: library.name, result: ingestion }));
      void refetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedReindexLibrary"));
    } finally {
      setReindexingLibraryId(null);
    }
  }

  async function handleExportLibrary(library: Library) {
    setExportingLibraryId(library.id);
    setError("");
    setStatusMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/libraries/${library.id}/export`);
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.detail ?? t("setup.messages.failedExportLibrary"));
      }

      const blob = await resp.blob();
      const header = resp.headers.get("Content-Disposition") ?? "";
      const match = header.match(/filename=\"?([^\";]+)\"?/i);
      const filename = match?.[1] ?? `${library.slug}_bundle.zip`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatusMessage(t("setup.messages.exportedLibrary", { name: library.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedExportLibrary"));
    } finally {
      setExportingLibraryId(null);
    }
  }

  async function handleImportLibraryBundle(file: File | null) {
    if (!file) return;
    setImportingLibrary(true);
    setError("");
    setStatusMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`${API_URL}/api/libraries/import`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? t("setup.messages.failedImportLibrary"));
      }
      const importedLibrary = data?.library as Library | undefined;
      await loadLibraries();
      if (importedLibrary?.id) {
        setStoredActiveLibraryId(importedLibrary.id);
      }
      setStatusMessage(t("setup.messages.importedLibrary", { name: importedLibrary?.name ?? file.name }));
      void refetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setup.messages.failedImportLibrary"));
    } finally {
      setImportingLibrary(false);
      setImportInputKey((value) => value + 1);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="rounded-[1.4rem]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("setup.ai.providersTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              {t("setup.ai.providersBody")}
            </p>
            <div className="rounded-2xl border border-border bg-background/75 p-3">
              <p className="text-xs font-medium text-foreground">
                {t("setup.ai.enabledProviders")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {enabledProviders.length > 0 ? (
                  enabledProviders.map((provider) => (
                    <span
                      key={provider.provider}
                      className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
                    >
                      {provider.label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("setup.ai.noEnabledProviders")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/75 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {t("setup.ai.providerPicker")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("setup.ai.configuredProviders", { count: configuredProviderCount })}
                </p>
              </div>
              <select
                value={activeProviderKey}
                onChange={(event) => setSelectedProviderKey(event.target.value)}
                className="h-10 min-w-[220px] rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              >
                {aiProviders.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            {activeProvider && activeProviderSetting ? (
              <div className="rounded-2xl border border-border bg-background/75 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{activeProvider.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{activeProvider.description}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      {t("setup.ai.apiLabel", { style: activeProvider.api_style })}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Checkbox
                      checked={activeProviderSetting.enabled}
                      onCheckedChange={(checked) =>
                        updateProviderSetting(activeProvider.key, { enabled: checked === true })
                      }
                    />
                    {t("setup.ai.enabled")}
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    value={activeProviderSetting.base_url}
                    onChange={(event) =>
                      updateProviderSetting(activeProvider.key, { base_url: event.target.value })
                    }
                    placeholder={activeProvider.default_base_url}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  />
                  <input
                    value={activeProviderSetting.default_model}
                    onChange={(event) =>
                      updateProviderSetting(activeProvider.key, { default_model: event.target.value })
                    }
                    placeholder={activeProvider.default_model}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  />
                </div>
                <input
                  type="password"
                  value={activeProviderSetting.api_key}
                  onChange={(event) =>
                    updateProviderSetting(activeProvider.key, {
                      api_key: event.target.value,
                      clear_api_key: false,
                    })
                  }
                  placeholder={
                    activeProviderSetting.has_key && !activeProviderSetting.api_key
                      ? t("setup.ai.savedKey", { hint: activeProviderSetting.api_key_hint || t("setup.ai.storedInKeychain") })
                      : t("setup.ai.apiKeyPlaceholder", { provider: activeProvider.label })
                  }
                  className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTestProvider(activeProvider.key)}
                    disabled={testingProvider === activeProvider.key}
                  >
                    {testingProvider === activeProvider.key ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {t("setup.ai.testConnection")}
                  </Button>
                  {activeProviderSetting.has_key ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateProviderSetting(activeProvider.key, {
                          api_key: "",
                          api_key_hint: "",
                          has_key: false,
                          clear_api_key: true,
                        })
                      }
                    >
                      {t("setup.ai.clearSavedKey")}
                    </Button>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {activeProviderSetting.has_key
                      ? t("setup.ai.keySaved", { hint: activeProviderSetting.api_key_hint ? ` (${activeProviderSetting.api_key_hint})` : "" })
                      : t("setup.ai.noSavedKey")}
                  </span>
                </div>
                {providerTestResults[activeProvider.key] ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {providerTestResults[activeProvider.key]}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-[1.4rem]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("setup.ai.stepRoutingTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              {t("setup.ai.stepRoutingBody")}
            </p>
            <div className="rounded-2xl border border-border bg-background/75 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setSingleStepRouting(true);
                    applySingleStepRouting(defaultStepProvider, defaultStepModel);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    singleStepRouting
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className="block font-medium">{t("setup.ai.sameModel")}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t("setup.ai.sameModelBody")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSingleStepRouting(false)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    !singleStepRouting
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className="block font-medium">{t("setup.ai.perStepModel")}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t("setup.ai.perStepModelBody")}</span>
                </button>
              </div>

              {singleStepRouting ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-foreground">
                      {t("setup.ai.globalProvider")}
                    </label>
                    <Select
                      value={defaultStepProvider}
                      onValueChange={(value) => applySingleStepRouting(value, defaultStepModel)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("setup.ai.chooseProvider")} />
                      </SelectTrigger>
                      <SelectContent>
                        {aiProviders.map((provider) => (
                          <SelectItem key={provider.key} value={provider.key}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-foreground">
                      {t("setup.ai.globalModel")}
                    </label>
                    <input
                      value={defaultStepModel}
                      onChange={(event) => applySingleStepRouting(defaultStepProvider, event.target.value)}
                      placeholder={
                        providerCatalogMap.get(defaultStepProvider)?.default_model ??
                        t("setup.ai.defaultModel")
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-medium text-foreground">{t("setup.ai.perStepList")}</p>
                  {aiSteps.map((step) => {
                    const config = stepConfigMap.get(step.key) ?? {
                      step: step.key,
                      provider: step.default_provider,
                      model: "",
                    };
                    return (
                      <div key={step.key} className="rounded-xl border border-border bg-background/70 p-3">
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-foreground">
                            {step.group === "pipeline" ? t("setup.ai.pipelineSteps") : t("setup.ai.workspaceFeatures")} · {step.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            value={config.provider}
                            onValueChange={(value) => updateStepConfig(step.key, { provider: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("setup.ai.chooseProvider")} />
                            </SelectTrigger>
                            <SelectContent>
                              {aiProviders.map((provider) => (
                                <SelectItem key={provider.key} value={provider.key}>
                                  {provider.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <input
                            value={config.model}
                            onChange={(event) => updateStepConfig(step.key, { model: event.target.value })}
                            placeholder={
                              providerCatalogMap.get(config.provider)?.default_model ??
                              providerCatalogMap.get(step.default_provider)?.default_model ??
                              t("setup.ai.modelOverride")
                            }
                            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <Button onClick={handleSaveAISettings} disabled={savingAI} className="w-full">
              {savingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("setup.ai.saveSettings")}
            </Button>
          </CardContent>
        </Card>
      </section>

      {loading ? (
        <div className="paper-panel flex items-center gap-3 rounded-[1.4rem] px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("setup.steps.loading")}
        </div>
      ) : (
        <section className="space-y-4 rounded-[1.4rem] border border-border bg-background/85 px-5 py-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t("setup.steps.confirmPathsTitle")}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("setup.steps.confirmPathsBody")}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PathBlock label={t("setup.paths.knowledgeBase")} value={config?.knowledge_base_dir ?? t("setup.status.unavailable")} />
            <PathBlock label={t("setup.paths.pdfCache")} value={config?.papers_dir ?? t("setup.status.unavailable")} />
            <PathBlock label={t("setup.paths.agentDb")} value={config?.agent_db_path ?? t("setup.status.unavailable")} />
            <PathBlock label={t("setup.paths.appDb")} value={config?.kb_db_path ?? t("setup.status.unavailable")} />
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-[1.4rem]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              {t("setup.cards.activeLibrary")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t("setup.cards.name")}: <span className="font-semibold text-foreground">{activeLibrary?.name ?? t("setup.status.unavailable")}</span>
            </p>
            <p>
              {t("setup.cards.discipline")}: <span className="font-semibold text-foreground">{activeLibrary?.discipline || t("setup.status.uncategorized")}</span>
            </p>
            <p>
              {t("setup.cards.indexedPapers")}: <span className="font-semibold text-foreground">{totalPapers.toLocaleString()}</span>
            </p>
            <p>
              {t("setup.cards.structuredCards")}: <span className="font-semibold text-foreground">{statsData?.stats.totalCards?.toLocaleString() ?? 0}</span>
            </p>
            <p>
              {t("setup.cards.atoms")}: <span className="font-semibold text-foreground">{statsData?.stats.totalAtoms?.toLocaleString() ?? 0}</span>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <MetricPill label={t("setup.cards.maps")} value={activeLibrary?.field_map_count ?? 0} />
              <MetricPill label={t("setup.cards.ideas")} value={activeLibrary?.idea_count ?? 0} />
              <MetricPill label={t("setup.cards.digests")} value={activeLibrary?.digest_count ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.4rem]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileStack className="h-4 w-4" />
              {t("setup.cards.importedFiles")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t("setup.cards.cachedPdfs")}: <span className="font-semibold text-foreground">{status?.downloaded_pdfs ?? 0}</span>
            </p>
            <p>
              {t("setup.cards.pendingQueue")}: <span className="font-semibold text-foreground">{status?.counts?.pending ?? 0}</span>
            </p>
            <p>
              {t("setup.cards.completedItems")}: <span className="font-semibold text-foreground">{status?.counts?.completed ?? 0}</span>
            </p>
            <p>
              {t("setup.cards.importBatches")}: <span className="font-semibold text-foreground">{activeLibrary?.import_batch_count ?? 0}</span>
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-[1.4rem]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              {t("setup.libraryExchange.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("setup.libraryExchange.body")}</p>
            <div className="rounded-2xl border border-border bg-background/75 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("setup.libraryExchange.formatTitle")}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t("setup.libraryExchange.formatBody")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("library-bundle-import")?.click()}
                disabled={importingLibrary}
              >
                {importingLibrary ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {t("setup.libraryExchange.import")}
              </Button>
              <input
                key={importInputKey}
                id="library-bundle-import"
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(event) => void handleImportLibraryBundle(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => activeLibrary ? void handleExportLibrary(activeLibrary) : undefined}
                disabled={!activeLibrary || exportingLibraryId === activeLibrary.id}
              >
                {activeLibrary && exportingLibraryId === activeLibrary.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {t("setup.libraryExchange.exportActive")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.4rem]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("setup.libraryForm.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <input
              value={newLibraryName}
              onChange={(event) => setNewLibraryName(event.target.value)}
              placeholder={t("setup.libraryForm.namePlaceholder")}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            />
            <input
              value={newLibraryDiscipline}
              onChange={(event) => setNewLibraryDiscipline(event.target.value)}
              placeholder={t("setup.libraryForm.disciplinePlaceholder")}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            />
            <Button onClick={handleCreateLibrary} disabled={creatingLibrary || !newLibraryName.trim()} className="w-full">
              {creatingLibrary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("setup.libraryForm.create")}
            </Button>
            {libraries.length > 0 && (
              <div className="rounded-2xl border border-border bg-background/70 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("setup.libraryForm.existing")}
                </p>
                <div className="mt-3 space-y-3">
                  {libraries.map((library) => (
                    <div key={library.id} className="rounded-xl border border-border bg-background px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {editingLibraryId === library.id ? (
                            <div className="space-y-2">
                              <input
                                value={editingLibraryName}
                                onChange={(event) => setEditingLibraryName(event.target.value)}
                                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                              />
                              <input
                                value={editingLibraryDiscipline}
                                onChange={(event) => setEditingLibraryDiscipline(event.target.value)}
                                placeholder={t("setup.libraryForm.disciplineEditPlaceholder")}
                                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                              />
                              <textarea
                                value={editingLibraryDescription}
                                onChange={(event) => setEditingLibraryDescription(event.target.value)}
                                placeholder={t("setup.libraryForm.descriptionPlaceholder")}
                                className="min-h-[84px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-foreground">{library.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {library.discipline || t("setup.status.uncategorized")} · {t("setup.libraryForm.papersCount", { count: library.paper_count })}
                                {library.id === defaultLibraryId ? ` · ${t("setup.status.default")}` : ""}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <MetricPill label={t("setup.cards.maps")} value={library.field_map_count} />
                                <MetricPill label={t("setup.cards.ideas")} value={library.idea_count} />
                                <MetricPill label={t("setup.cards.digests")} value={library.digest_count} />
                                <MetricPill label={t("setup.cards.imports")} value={library.import_batch_count} />
                              </div>
                              {library.description ? (
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  {library.description}
                                </p>
                              ) : null}
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                {t("setup.libraryForm.latestMeta", {
                                  digest: library.latest_digest_date ?? t("setup.status.none"),
                                  idea: library.latest_idea_date ?? t("setup.status.none"),
                                })}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href="/pipeline"
                              onClick={() => setStoredActiveLibraryId(library.id)}
                            >
                              {t("setup.libraryForm.use")}
                            </Link>
                          </Button>
                          {editingLibraryId === library.id ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleSaveLibrary(library.id)}
                                disabled={savingLibraryId === library.id || !editingLibraryName.trim()}
                              >
                                {savingLibraryId === library.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Save className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                {t("common.actions.cancel")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStartEdit(library)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleReindexLibrary(library)}
                                disabled={reindexingLibraryId === library.id}
                              >
                                {reindexingLibraryId === library.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleExportLibrary(library)}
                                disabled={exportingLibraryId === library.id}
                              >
                                {exportingLibraryId === library.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleDeleteLibrary(library)}
                                disabled={deletingLibraryId === library.id || library.id === defaultLibraryId}
                              >
                                {deletingLibraryId === library.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <PathBlock label={t("setup.paths.pdfs")} value={library.papers_dir} />
                        <PathBlock label={t("setup.paths.knowledgeBase")} value={library.knowledge_base_dir} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
