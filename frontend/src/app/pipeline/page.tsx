"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  Download,
  Upload,
  Play,
  PauseCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Clock,
  AlertCircle,
  MinusCircle,
  Network,
  RotateCcw,
  Trash2,
  ListChecks,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appConfig } from "@/lib/app-config";
import { getApiUrl, readErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n/locale-context";
import type {
  AIProviderCatalogItem,
  AIProviderSetting,
  AIStepCatalogItem,
  AIStepConfig,
  ImportBatch,
  Library,
} from "@/lib/types";
import { getStoredActiveLibraryId, resolveInitialLibraryId, setStoredActiveLibraryId } from "@/lib/libraries";

const API_URL = getApiUrl();
const CREATE_LIBRARY_SELECT_VALUE = "__create_library__";

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
    duplicate?: boolean;
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
  category?: string;
}

type StepStatus = "idle" | "running" | "done" | "error" | "skipped";
type ReadingQueueStatus = "queued" | "running" | "done" | "error" | "cancelled";
type ReadingJobStatus = "queued" | "running" | "done" | "error" | "cancelled";
type AIModelMode = "unified" | "per_step";

interface ReadingQueueItem {
  id: string;
  paperId: string;
  status: ReadingQueueStatus;
  step: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

interface ReadingJobItem {
  paper_id: string;
  status: ReadingQueueStatus;
  step: string;
  message?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

interface PostReadingUpdate {
  status: "running" | "done" | "error" | "skipped";
  step: string;
  message?: string;
  started_at?: string | null;
  completed_at?: string | null;
  result?: unknown;
}

interface ReadingJob {
  id: string;
  library_id: number;
  status: ReadingJobStatus;
  requested: number;
  processed: number;
  succeeded: number;
  failed: number;
  cancel_requested?: boolean;
  current_paper_id?: string | null;
  update_graph?: boolean;
  update_ideas?: boolean;
  update_graph_and_ideas?: boolean;
  post_reading_update?: PostReadingUpdate | null;
  items: ReadingJobItem[];
}

interface ReadingOutputSection {
  section: string;
  content: string;
}

interface ReadingOutput {
  paper?: {
    paper_id?: string;
    title?: string;
    year?: number | null;
    authors?: string[] | string | null;
  } | null;
  sections: ReadingOutputSection[];
  processing?: {
    processing_status?: string | null;
    reading_profile?: string | null;
    coverage?: string | null;
  } | null;
}

interface AISettingsResponse {
  providers: AIProviderCatalogItem[];
  steps: AIStepCatalogItem[];
  provider_settings: AIProviderSetting[];
  step_configs: AIStepConfig[];
}

const DEFAULT_READING_PROFILE_OPTIONS: ReadingProfileOption[] = [
  {
    value: "auto",
    label: "标准学术卡片",
    description: "直接读取论文，生成通用学术卡片和可复用结构化元素。",
  },
  {
    value: "metadata_only",
    label: "仅元数据",
    description: "只登记论文，不运行 AI 阅读。",
  },
  {
    value: "title_abstract",
    label: "快速概览",
    description: "直接读取论文，重点提取标题、摘要和问题框架。",
  },
  {
    value: "full_content",
    label: "全文精读",
    description: "提取方法、数据、发现、局限和后续研究等全文信息。",
  },
  {
    value: "section_batch",
    label: "按小节分批",
    description: "先按 Introduction、Data、Results 等小节逐段读取，再汇总成结构化卡片。更慢，但长文覆盖更完整。",
  },
  {
    value: "style_logic",
    label: "文风 + 逻辑",
    description: "在全文提取基础上额外关注写作风格和论证逻辑。",
  },
  {
    value: "custom",
    label: "自定义模式",
    description: "使用你编辑的读取说明和分析维度。",
  },
];

const EN_READING_PROFILE_OPTIONS: ReadingProfileOption[] = [
  { value: "auto", label: "Standard academic card", description: "Read the paper into a balanced academic card and reusable structured elements." },
  { value: "metadata_only", label: "Metadata only", description: "Register the paper without running AI reading." },
  { value: "title_abstract", label: "Quick overview", description: "Focus on the title, abstract, and question framing." },
  { value: "full_content", label: "Full-text read", description: "Extract methods, data, findings, limitations, and future research from the full paper." },
  { value: "section_batch", label: "Section by section", description: "Read long papers section by section, then merge the results into one structured card." },
  { value: "style_logic", label: "Style + logic", description: "Add writing style and argument logic to the full-text extraction." },
  { value: "custom", label: "Custom", description: "Use your edited instructions and selected analysis dimensions." },
];

const DEFAULT_ANALYSIS_FOCUS_OPTIONS: AnalysisFocusOption[] = [
  {
    value: "title_abstract",
    label: "标题与摘要",
    category: "基础",
    description: "提取论文标题、摘要结构、核心对象、关键词和一句话 takeaway；区分作者真正研究的问题、使用的材料和最终主张。",
  },
  {
    value: "research_question",
    label: "研究问题",
    category: "基础",
    description: "说明论文精确回答什么问题、为什么重要、面向哪类争论或事实缺口；指出它相对既有文献新增了哪一块证据或解释。",
  },
  {
    value: "literature_position",
    label: "文献位置",
    category: "基础",
    description: "定位论文所属文献群、最接近的前人工作和分歧点；说明作者如何声称自己推进了理论、方法、数据或经验事实。",
  },
  {
    value: "institutional_context",
    label: "制度与背景",
    category: "背景",
    description: "解释理解论文所需的制度、政策、市场、技术或历史背景；标出关键时间线、参与主体、规则变化和为什么这些背景会影响识别或解释。",
  },
  {
    value: "theory_framework",
    label: "理论框架",
    category: "理论",
    description: "提取模型设定、核心主体、行动空间、约束、信息结构、均衡概念、关键命题和理论预测；区分形式模型结论与直觉解释。",
  },
  {
    value: "hypotheses_predictions",
    label: "假说与预测",
    category: "理论",
    description: "列出显式假说、可检验预测和比较静态；说明每个预测对应哪些变量、样本或检验，实证结果是否支持原始理论。",
  },
  {
    value: "methods_data",
    label: "方法与数据",
    category: "实证",
    description: "识别研究方法、数据来源、样本范围、观察单位、核心变量、清洗合并步骤和样本排除规则；尽量记录可复现的数据构造细节。",
  },
  {
    value: "identification",
    label: "识别策略",
    category: "实证",
    description: "提取因果 variation 来源、估计方程、处理组/对照组、固定效应、标准误、识别假设和主要威胁；说明作者用什么证据缓解内生性担忧。",
  },
  {
    value: "robustness",
    label: "稳健性",
    category: "实证",
    description: "总结稳健性检验、安慰剂、敏感性分析、替代变量、替代样本和替代规格；说明每项检验想排除什么威胁，哪些威胁仍未解决。",
  },
  {
    value: "findings",
    label: "发现",
    category: "结果",
    description: "提取主要结果、效应量级、统计显著性、经济意义、异质性和边界条件；区分表格直接显示的结果与作者进一步解释的贡献。",
  },
  {
    value: "mechanisms",
    label: "机制",
    category: "结果",
    description: "提取作者提出的因果通道、机制检验、中介变量和辅助证据；说明哪些机制得到支持，哪些只是推测，以及可能遗漏的替代机制。",
  },
  {
    value: "external_validity",
    label: "外部有效性",
    category: "结果",
    description: "判断发现可迁移到哪些人群、地区、时期、制度或市场；指出在哪些条件下可能失效，以及还需要什么证据测试可迁移性。",
  },
  {
    value: "policy_implications",
    label: "政策含义",
    category: "政策",
    description: "解释论文对政策、监管或组织决策的含义；识别受影响群体、福利方向、潜在意外后果、实施约束和作者没有展开的政策取舍。",
  },
  {
    value: "welfare_counterfactuals",
    label: "福利与反事实",
    category: "政策",
    description: "提取福利分析、反事实实验、分配影响和成本收益口径；记录反事实依赖的关键参数、模型假设和不确定性来源。",
  },
  {
    value: "method_reuse",
    label: "可复用设计",
    category: "复用",
    description: "识别可以迁移到其他研究的设计、测量方法、数据构造 recipe、识别思路和适用场景；说明复用时必须满足的前提条件。",
  },
  {
    value: "data_reuse",
    label: "可复用数据",
    category: "复用",
    description: "列出论文使用或构建的数据资产、访问条件、授权限制、复现障碍、替代数据源和潜在复用领域；标出公开数据与私有数据。",
  },
  {
    value: "limitations",
    label: "局限",
    category: "复用",
    description: "识别论文最强假设、未解决弱点、数据限制、测量误差、样本选择和解释威胁；区分作者承认的局限与读者应额外警惕的问题。",
  },
  {
    value: "future_research",
    label: "后续研究",
    category: "复用",
    description: "提出具体可执行的后续问题、新场景、新数据、新机制检验和可发表扩展；优先给出能直接转化为研究设计的方向。",
  },
  {
    value: "writing_style",
    label: "写作风格",
    category: "写作",
    description: "分析论文的写作风格、引言结构、叙事顺序、概念解释、过渡句和复杂思想的表达方式；提取值得学习的段落组织方法。",
  },
  {
    value: "argument_logic",
    label: "论证逻辑",
    category: "写作",
    description: "追踪从研究动机、理论预期、数据证据到结论的推理链条；指出关键假设、证据跳跃、逻辑薄弱点和作者如何处理反驳。",
  },
  {
    value: "figures_tables",
    label: "图表",
    category: "写作",
    description: "解释最重要的图表和表格：展示什么、读者应先看哪几列/面板、支持哪个论点、是否有异常值或容易误读的地方。",
  },
  {
    value: "technical_appendix",
    label: "技术附录",
    category: "深入",
    description: "提取附录中的证明、推导、额外表格、数据构造细节、算法步骤和容易被正文省略的稳健性证据；标出哪些附录内容会改变对正文的理解。",
  },
];

const EN_ANALYSIS_FOCUS_META: Record<string, { label: string; category: string }> = {
  title_abstract: { label: "Title & abstract", category: "Core" },
  research_question: { label: "Research question", category: "Core" },
  literature_position: { label: "Literature position", category: "Core" },
  institutional_context: { label: "Institutional context", category: "Context" },
  theory_framework: { label: "Theory framework", category: "Theory" },
  hypotheses_predictions: { label: "Hypotheses & predictions", category: "Theory" },
  methods_data: { label: "Methods & data", category: "Empirical" },
  identification: { label: "Identification", category: "Empirical" },
  robustness: { label: "Robustness", category: "Empirical" },
  findings: { label: "Findings", category: "Results" },
  mechanisms: { label: "Mechanisms", category: "Results" },
  external_validity: { label: "External validity", category: "Results" },
  policy_implications: { label: "Policy implications", category: "Policy" },
  welfare_counterfactuals: { label: "Welfare & counterfactuals", category: "Policy" },
  method_reuse: { label: "Reusable design", category: "Reuse" },
  data_reuse: { label: "Reusable data", category: "Reuse" },
  limitations: { label: "Limitations", category: "Reuse" },
  future_research: { label: "Future research", category: "Reuse" },
  writing_style: { label: "Writing style", category: "Writing" },
  argument_logic: { label: "Argument logic", category: "Writing" },
  figures_tables: { label: "Figures & tables", category: "Writing" },
  technical_appendix: { label: "Technical appendix", category: "Advanced" },
};

const EN_ANALYSIS_FOCUS_DESCRIPTIONS: Record<string, string> = {
  title_abstract: "Extract the title, abstract structure, key objects, keywords, and one-sentence takeaway; distinguish the question, evidence, and final claim.",
  research_question: "State the exact question, why it matters, which debate or empirical gap it addresses, and what evidence or explanation the paper adds.",
  literature_position: "Map the paper to its closest literatures, predecessors, and disagreements; explain whether the contribution is theory, method, data, or empirical fact.",
  institutional_context: "Explain the institutional, policy, market, technological, or historical context and how it affects identification or interpretation.",
  theory_framework: "Extract the model setup, agents, actions, constraints, information, equilibrium concept, propositions, and theoretical predictions.",
  hypotheses_predictions: "List explicit hypotheses, testable predictions, and comparative statics; connect each prediction to variables, samples, and tests.",
  methods_data: "Identify methods, data sources, sample coverage, unit of observation, variables, cleaning and merge steps, and exclusions needed for replication.",
  identification: "Extract causal variation, estimating equations, treatment and control definitions, fixed effects, standard errors, assumptions, and threats to identification.",
  robustness: "Summarize robustness checks, placebos, sensitivity analysis, alternative variables, samples, and specifications, including remaining threats.",
  findings: "Report main results with magnitudes, statistical and economic significance, heterogeneity, boundary conditions, and evidence versus interpretation.",
  mechanisms: "Extract proposed causal channels, mechanism tests, mediators, and auxiliary evidence; separate supported mechanisms from speculation.",
  external_validity: "Assess which populations, places, periods, institutions, or markets the findings may transfer to and where they may fail.",
  policy_implications: "Explain implications for policy, regulation, or organizations, including affected groups, welfare direction, implementation constraints, and tradeoffs.",
  welfare_counterfactuals: "Extract welfare analysis, counterfactuals, distributional effects, cost-benefit measures, key parameters, assumptions, and uncertainty.",
  method_reuse: "Identify reusable designs, measurement strategies, data construction recipes, and identification ideas, plus prerequisites for reuse.",
  data_reuse: "List data assets, access conditions, licensing limits, replication barriers, substitute sources, and possible reuse cases.",
  limitations: "Identify the strongest assumptions, unresolved weaknesses, data limits, measurement error, selection, and interpretation threats.",
  future_research: "Propose concrete follow-up questions, settings, data, mechanism tests, and publishable extensions that can become research designs.",
  writing_style: "Analyze narrative structure, exposition, transitions, figure use, and techniques for explaining complex ideas.",
  argument_logic: "Trace the reasoning from motivation and theory through evidence and conclusions; flag assumptions, logical jumps, and weak rebuttals.",
  figures_tables: "Explain the most important figures and tables, what to inspect first, which claims they support, and possible misreadings or anomalies.",
  technical_appendix: "Extract proofs, derivations, extra tables, data construction details, algorithms, and appendix evidence that changes the main interpretation.",
};

const EN_ANALYSIS_FOCUS_OPTIONS: AnalysisFocusOption[] = DEFAULT_ANALYSIS_FOCUS_OPTIONS.map((option) => ({
  ...option,
  label: EN_ANALYSIS_FOCUS_META[option.value]?.label ?? option.value,
  category: EN_ANALYSIS_FOCUS_META[option.value]?.category ?? "Other",
  description: EN_ANALYSIS_FOCUS_DESCRIPTIONS[option.value] ?? option.value,
}));

type PaperKind = "empirical" | "theory" | "structural" | "policy" | "review" | "methods" | "writing";
type ReadingDepth = "quick" | "standard" | "deep";

const PAPER_KIND_OPTIONS: Array<{ value: PaperKind; label: string; description: string; labelEn: string; descriptionEn: string }> = [
  { value: "empirical", label: "实证论文", description: "识别、数据、结果和机制优先。", labelEn: "Empirical paper", descriptionEn: "Prioritize identification, data, results, and mechanisms." },
  { value: "theory", label: "理论论文", description: "模型、假设、命题和可检验含义优先。", labelEn: "Theory paper", descriptionEn: "Prioritize models, assumptions, propositions, and testable implications." },
  { value: "structural", label: "结构模型", description: "模型设定、估计、参数、反事实和福利优先。", labelEn: "Structural model", descriptionEn: "Prioritize setup, estimation, parameters, counterfactuals, and welfare." },
  { value: "policy", label: "政策/时政", description: "制度背景、政策影响、群体差异和争议点优先。", labelEn: "Policy / current affairs", descriptionEn: "Prioritize institutions, policy effects, group differences, and debates." },
  { value: "review", label: "综述论文", description: "文献地图、共识、争议和未来方向优先。", labelEn: "Review paper", descriptionEn: "Prioritize the literature map, consensus, disputes, and future directions." },
  { value: "methods", label: "方法论文", description: "适用条件、算法/估计器、比较和实践注意事项优先。", labelEn: "Methods paper", descriptionEn: "Prioritize assumptions, estimators, comparisons, and practical cautions." },
  { value: "writing", label: "写作学习", description: "叙事结构、图表、论证节奏和表达方式优先。", labelEn: "Writing study", descriptionEn: "Prioritize narrative structure, figures, argument pacing, and exposition." },
];

const READING_DEPTH_OPTIONS: Array<{ value: ReadingDepth; label: string; description: string; labelEn: string; descriptionEn: string }> = [
  { value: "quick", label: "浅读", description: "快速抓住问题、方法和结论。", labelEn: "Quick", descriptionEn: "Capture the question, method, and conclusion quickly." },
  { value: "standard", label: "标准", description: "适合日常文献卡片和图谱结构化。", labelEn: "Standard", descriptionEn: "Balanced for routine cards and graph structure." },
  { value: "deep", label: "深读", description: "增加稳健性、局限、复用和后续研究。", labelEn: "Deep", descriptionEn: "Add robustness, limitations, reuse, and future research." },
];

const PAPER_KIND_FOCUSES: Record<PaperKind, string[]> = {
  empirical: ["research_question", "literature_position", "methods_data", "identification", "findings", "mechanisms", "robustness", "limitations", "method_reuse"],
  theory: ["research_question", "literature_position", "theory_framework", "hypotheses_predictions", "mechanisms", "external_validity", "future_research", "argument_logic"],
  structural: ["research_question", "theory_framework", "methods_data", "identification", "welfare_counterfactuals", "findings", "robustness", "limitations", "technical_appendix"],
  policy: ["title_abstract", "institutional_context", "research_question", "methods_data", "findings", "mechanisms", "policy_implications", "external_validity", "limitations"],
  review: ["title_abstract", "literature_position", "research_question", "methods_data", "findings", "limitations", "future_research", "data_reuse"],
  methods: ["research_question", "methods_data", "identification", "robustness", "method_reuse", "data_reuse", "limitations", "technical_appendix"],
  writing: ["title_abstract", "research_question", "writing_style", "argument_logic", "figures_tables", "literature_position", "method_reuse"],
};

const DEPTH_EXTRA_FOCUSES: Record<ReadingDepth, string[]> = {
  quick: ["title_abstract", "research_question", "findings"],
  standard: [],
  deep: ["robustness", "external_validity", "limitations", "future_research", "figures_tables", "technical_appendix"],
};

const READING_PROFILE_LABELS = new Map(
  DEFAULT_READING_PROFILE_OPTIONS.map((option) => [option.value, option])
);
const ANALYSIS_FOCUS_LABELS = new Map(
  DEFAULT_ANALYSIS_FOCUS_OPTIONS.map((option) => [option.value, option])
);

function localizeReadingProfiles(options: ReadingProfileOption[], isZh: boolean) {
  const labels = isZh ? READING_PROFILE_LABELS : new Map(EN_READING_PROFILE_OPTIONS.map((option) => [option.value, option]));
  return options.map((option) => ({ ...option, ...(labels.get(option.value) ?? {}) }));
}

function localizeAnalysisFocuses(options: AnalysisFocusOption[], isZh: boolean) {
  if (isZh) {
    return options.map((option) => ({ ...option, ...(ANALYSIS_FOCUS_LABELS.get(option.value) ?? {}) }));
  }
  return options.map((option) => ({
    ...option,
    label: EN_ANALYSIS_FOCUS_META[option.value]?.label ?? option.label,
    category: EN_ANALYSIS_FOCUS_META[option.value]?.category ?? option.category ?? "Other",
    description: EN_ANALYSIS_FOCUS_DESCRIPTIONS[option.value] ?? option.description,
  }));
}

function buildDefaultFocusPrompts(options: AnalysisFocusOption[]) {
  return Object.fromEntries(options.map((option) => [option.value, option.description]));
}

function slugifyFocusValue(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized ? `custom_${normalized}` : `custom_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Status icon helper
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-[#2c4870]" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-[var(--forest)]" />;
    case "error":
      return <XCircle className="h-4 w-4 text-[var(--rust)]" />;
    case "skipped":
      return <MinusCircle className="h-4 w-4 text-[var(--ink-5)]" />;
    default:
      return <Clock className="h-4 w-4 text-[var(--ink-5)]" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]";
    case "triaged":
      return "bg-[#e9eef6] text-[#223a5e] border-[#bccbe0]";
    case "pending":
      return "bg-[#f4ead8] text-[#7a5a18] border-[#d6b678]";
    case "error":
    case "pdf_error":
    case "timeout":
      return "bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]";
    default:
      return "bg-[var(--paper-2)] text-[var(--ink-3)] border-[var(--line-soft)]";
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
    <div className="rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1.5 text-xs text-[var(--ink-4)]">
      <span className="font-semibold text-[var(--ink)]">{value}</span> {label}
    </div>
  );
}

function splitQueueIdentifiers(...values: Array<string | null | undefined>): string[] {
  const identifiers = values
    .flatMap((value) => (value ?? "").split(/[,\s]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(identifiers));
}

function normalizePaperIds(...values: Array<string | null | undefined>): string[] {
  return splitQueueIdentifiers(...values).map((value) => value.toLowerCase());
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function normalizeDoiIdentifier(value: string): string {
  return value
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/[.;,\s]+$/g, "");
}

function isDoiIdentifier(value: string): boolean {
  return /^10\.\d{4,9}\/\S+$/i.test(normalizeDoiIdentifier(value));
}

function isNberPaperId(value: string): boolean {
  return /^w\d{3,8}$/i.test(value.trim());
}

function createQueueItem(paperId: string, message: string | undefined, isZh: boolean): ReadingQueueItem {
  return {
    id: `${paperId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    paperId,
    status: "queued",
    step: isZh ? "等待读取" : "Waiting to read",
    message,
  };
}

function queueItemsFromJob(job: ReadingJob): ReadingQueueItem[] {
  return job.items.map((item) => ({
    id: `${job.id}-${item.paper_id}`,
    paperId: item.paper_id,
    status: item.status,
    step: item.step,
    message: item.message,
    startedAt: item.started_at ?? undefined,
    completedAt: item.completed_at ?? undefined,
  }));
}

function compactQueueMessage(message?: string): string {
  const text = (message ?? "").trim();
  if (!text) return "";
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text;
  return firstLine.length > 260 ? `${firstLine.slice(0, 260)}...` : firstLine;
}

const READING_JOB_TEXT: Record<string, { en: string; zh: string }> = {
  "等待读取": { en: "Waiting to read", zh: "等待读取" },
  "已取消": { en: "Cancelled", zh: "已取消" },
  "调用 AI 读取": { en: "Calling AI reader", zh: "调用 AI 读取" },
  "AI 正在读取论文。长论文或多维度读取可能需要几分钟。": {
    en: "AI is reading the paper. Long papers or many dimensions may take several minutes.",
    zh: "AI 正在读取论文。长论文或多维度读取可能需要几分钟。",
  },
  "下载 PDF 并读取": { en: "Downloading PDF and reading", zh: "下载 PDF 并读取" },
  "本地文件不可用，已切换到导入流程。": {
    en: "The local file is unavailable; switched to the import flow.",
    zh: "本地文件不可用，已切换到导入流程。",
  },
  "登记完成": { en: "Registration complete", zh: "登记完成" },
  "已登记论文，未运行 AI 读取。": {
    en: "Paper registered without AI reading.",
    zh: "已登记论文，未运行 AI 读取。",
  },
  "读取完成": { en: "Reading complete", zh: "读取完成" },
  "已完成 AI 读取": { en: "AI reading completed", zh: "已完成 AI 读取" },
  "已请求中止": { en: "Stop requested", zh: "已请求中止" },
  "任务已收到取消请求。": { en: "The job received a cancellation request.", zh: "任务已收到取消请求。" },
  "读取失败": { en: "Reading failed", zh: "读取失败" },
  "AI 读取失败，请重试。": { en: "AI reading failed. Please retry.", zh: "AI 读取失败，请重试。" },
  "AI 已返回内容，但评分区块格式无法解析。请重试；如果仍失败，减少读取维度或切换为 Title + Abstract。": {
    en: "AI returned content, but the score block could not be parsed. Retry, reduce dimensions, or use Title + Abstract.",
    zh: "AI 已返回内容，但评分区块格式无法解析。请重试；如果仍失败，减少读取维度或切换为 Title + Abstract。",
  },
  "AI 读取超时。长论文可切换为 Section-by-section，或减少读取维度后重试。": {
    en: "AI reading timed out. Use Section by section for long papers or reduce the reading dimensions.",
    zh: "AI 读取超时。长论文可切换为 Section-by-section，或减少读取维度后重试。",
  },
  "AI 服务连接中断。请稍后重试，或减少读取维度。": {
    en: "The AI service connection was interrupted. Retry later or reduce the reading dimensions.",
    zh: "AI 服务连接中断。请稍后重试，或减少读取维度。",
  },
  "PDF 文本抽取失败。请确认文件不是扫描版图片 PDF，并尝试上传可复制文本的 PDF。": {
    en: "PDF text extraction failed. Confirm that the file is not image-only and upload a text-selectable PDF.",
    zh: "PDF 文本抽取失败。请确认文件不是扫描版图片 PDF，并尝试上传可复制文本的 PDF。",
  },
  "找不到本地 PDF。请重新上传文件，或确认这篇论文已经绑定到当前文献库。": {
    en: "The local PDF was not found. Upload it again or confirm that the paper belongs to the active library.",
    zh: "找不到本地 PDF。请重新上传文件，或确认这篇论文已经绑定到当前文献库。",
  },
  "正在运行 Linker。": { en: "Running Linker.", zh: "正在运行 Linker。" },
  "正在运行 Linker、Thinker 和 Critic。": {
    en: "Running Linker, Thinker, and Critic.",
    zh: "正在运行 Linker、Thinker 和 Critic。",
  },
  "已完成 Linker 和索引刷新。": {
    en: "Linker and index refresh completed.",
    zh: "已完成 Linker 和索引刷新。",
  },
  "已完成 Linker、Thinker、Critic 和索引刷新。": {
    en: "Linker, Thinker, Critic, and index refresh completed.",
    zh: "已完成 Linker、Thinker、Critic 和索引刷新。",
  },
  "没有成功完成的 AI 读取，或任务已取消/仅元数据模式。": {
    en: "No AI reading completed successfully, or the job was cancelled or metadata-only.",
    zh: "没有成功完成的 AI 读取，或任务已取消/仅元数据模式。",
  },
};

function localizeReadingJobText(value: string | null | undefined, isZh: boolean): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  const direct = READING_JOB_TEXT[text];
  if (direct) return isZh ? direct.zh : direct.en;

  const dynamicPatterns: Array<[RegExp, (target: string) => { en: string; zh: string }]> = [
    [/^更新 (.+)$/, (target) => ({ en: `Updating ${target.replace(/ 和 /g, " & ")}`, zh: `更新 ${target}` })],
    [/^(.+) 更新失败$/, (target) => ({ en: `${target.replace(/ 和 /g, " & ")} update failed`, zh: `${target} 更新失败` })],
    [/^(.+) 已更新$/, (target) => ({ en: `${target.replace(/ 和 /g, " & ")} updated`, zh: `${target} 已更新` })],
    [/^跳过 (.+)$/, (target) => ({ en: `Skipped ${target.replace(/ 和 /g, " & ")}`, zh: `跳过 ${target}` })],
  ];
  for (const [pattern, format] of dynamicPatterns) {
    const match = text.match(pattern);
    if (match) {
      const translated = format(match[1]);
      return isZh ? translated.zh : translated.en;
    }
  }
  return text;
}

function queueStatusLabel(status: ReadingQueueStatus, isZh: boolean): string {
  switch (status) {
    case "queued":
      return isZh ? "等待中" : "Queued";
    case "running":
      return isZh ? "读取中" : "Reading";
    case "done":
      return isZh ? "完成" : "Done";
    case "error":
      return isZh ? "失败" : "Failed";
    case "cancelled":
      return isZh ? "已取消" : "Cancelled";
  }
}

function queueStatusClass(status: ReadingQueueStatus): string {
  switch (status) {
    case "running":
      return "border-[#bccbe0] bg-[#e9eef6] text-[#223a5e]";
    case "done":
      return "border-[var(--forest)] bg-[var(--forest-soft)] text-[var(--forest-2)]";
    case "error":
      return "border-[#da9a80] bg-[#f4dfd5] text-[#8a3318]";
    case "cancelled":
      return "border-[var(--line-soft)] bg-[var(--paper-2)] text-[var(--ink-3)]";
    default:
      return "border-[#d6b678] bg-[#f4ead8] text-[#7a5a18]";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PipelinePageContent() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const copy = useCallback((english: string, chinese: string) => (isZh ? chinese : english), [isZh]);
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
  const [importIdentifier, setImportIdentifier] = useState("");
  const [doiLoading, setDoiLoading] = useState(false);
  const [doiMessage, setDoiMessage] = useState("");
  const [recentImportedPapers, setRecentImportedPapers] = useState<
    Array<{ paperId: string; note?: string }>
  >([]);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [uploadResult, setUploadResult] = useState<{
    paper_id?: string;
    library_id?: number;
    status?: string;
    registered?: boolean;
    duplicate?: boolean;
    reading_profile?: string;
    text_cache?: {
      status?: string;
      scout_text_path?: string;
      scout_chars?: number;
      full_text_path?: string;
      full_chars?: number;
      error?: string;
    };
    error?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null);
  const [createLibraryOpen, setCreateLibraryOpen] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState("");
  const [newLibraryDiscipline, setNewLibraryDiscipline] = useState("");
  const [newLibraryDescription, setNewLibraryDescription] = useState("");
  const [newLibraryPapersDir, setNewLibraryPapersDir] = useState("");
  const [newLibraryKnowledgeDir, setNewLibraryKnowledgeDir] = useState("");
  const [newLibraryAgentDbPath, setNewLibraryAgentDbPath] = useState("");
  const [createLibraryLoading, setCreateLibraryLoading] = useState(false);
  const [createLibraryError, setCreateLibraryError] = useState("");
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchUploadResult | null>(null);
  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [importsLoading, setImportsLoading] = useState(false);
  const [readingProfile, setReadingProfile] = useState("auto");
  const [paperKind, setPaperKind] = useState<PaperKind>("empirical");
  const [readingDepth, setReadingDepth] = useState<ReadingDepth>("standard");
  const [analysisFocuses, setAnalysisFocuses] = useState<string[]>([
    "research_question",
    "methods_data",
    "findings",
    "identification",
    "limitations",
  ]);
  const [readingProfileOptions, setReadingProfileOptions] = useState<ReadingProfileOption[]>(
    EN_READING_PROFILE_OPTIONS
  );
  const [analysisFocusOptions, setAnalysisFocusOptions] = useState<AnalysisFocusOption[]>(
    EN_ANALYSIS_FOCUS_OPTIONS
  );
  const [analysisFocusPrompts, setAnalysisFocusPrompts] = useState<Record<string, string>>(
    () => buildDefaultFocusPrompts(isZh ? DEFAULT_ANALYSIS_FOCUS_OPTIONS : EN_ANALYSIS_FOCUS_OPTIONS)
  );
  const [activeAnalysisFocus, setActiveAnalysisFocus] = useState<string | null>("research_question");
  const [customReadingInstructions, setCustomReadingInstructions] = useState("");
  const [newFocusLabel, setNewFocusLabel] = useState("");
  const [newFocusPrompt, setNewFocusPrompt] = useState("");
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [updateGraphAfterReading, setUpdateGraphAfterReading] = useState(false);
  const [updateIdeasAfterReading, setUpdateIdeasAfterReading] = useState(false);

  // --- AI reading queue ---
  const [readingQueue, setReadingQueue] = useState<ReadingQueueItem[]>([]);
  const [activeReadingJob, setActiveReadingJob] = useState<ReadingJob | null>(null);
  const [recentReadingJobs, setRecentReadingJobs] = useState<ReadingJob[]>([]);
  const [queueListOpen, setQueueListOpen] = useState(false);
  const [expandedReadingPaperId, setExpandedReadingPaperId] = useState<string | null>(null);
  const [readingOutputByPaperId, setReadingOutputByPaperId] = useState<Record<string, ReadingOutput>>({});
  const [readingOutputLoadingId, setReadingOutputLoadingId] = useState<string | null>(null);
  const [readingOutputError, setReadingOutputError] = useState("");
  const [readingJobError, setReadingJobError] = useState("");
  const [aiProviders, setAiProviders] = useState<AIProviderCatalogItem[]>([]);
  const [aiSteps, setAiSteps] = useState<AIStepCatalogItem[]>([]);
  const [providerSettings, setProviderSettings] = useState<AIProviderSetting[]>([]);
  const [stepConfigs, setStepConfigs] = useState<AIStepConfig[]>([]);
  const [aiModelDialogOpen, setAiModelDialogOpen] = useState(false);
  const [aiModelMode, setAiModelMode] = useState<AIModelMode>("unified");
  const [unifiedProvider, setUnifiedProvider] = useState("");
  const [unifiedModel, setUnifiedModel] = useState("");
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [aiSettingsError, setAiSettingsError] = useState("");
  const [aiSettingsMessage, setAiSettingsMessage] = useState("");
  const readingQueueRef = useRef<ReadingQueueItem[]>([]);
  const queuedFromParamsRef = useRef("");

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

  const handleCreateLibrary = useCallback(async () => {
    if (!newLibraryName.trim()) {
      setCreateLibraryError(copy("Enter a library name.", "请输入数据库名称。"));
      return;
    }
    setCreateLibraryLoading(true);
    setCreateLibraryError("");
    try {
      const resp = await fetch(`${API_URL}/api/libraries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLibraryName.trim(),
          discipline: newLibraryDiscipline.trim(),
          description: newLibraryDescription.trim(),
          papers_dir: newLibraryPapersDir.trim(),
          knowledge_base_dir: newLibraryKnowledgeDir.trim(),
          agent_db_path: newLibraryAgentDbPath.trim(),
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      const library = data?.library as Library | undefined;
      if (library?.id) {
        setStoredActiveLibraryId(library.id);
        setSelectedLibraryId(library.id);
      }
      await loadLibraries();
      setCreateLibraryOpen(false);
      setNewLibraryName("");
      setNewLibraryDiscipline("");
      setNewLibraryDescription("");
      setNewLibraryPapersDir("");
      setNewLibraryKnowledgeDir("");
      setNewLibraryAgentDbPath("");
    } catch (error) {
      setCreateLibraryError(
        error instanceof Error
          ? error.message
          : copy("Could not create the library.", "无法创建数据库")
      );
    } finally {
      setCreateLibraryLoading(false);
    }
  }, [
    copy,
    loadLibraries,
    newLibraryAgentDbPath,
    newLibraryDescription,
    newLibraryDiscipline,
    newLibraryKnowledgeDir,
    newLibraryName,
    newLibraryPapersDir,
  ]);

  const fetchPipelineOptions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/pipeline/options`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data.reading_profiles) && data.reading_profiles.length > 0) {
        setReadingProfileOptions(localizeReadingProfiles(data.reading_profiles as ReadingProfileOption[], isZh));
      }
      if (Array.isArray(data.analysis_focuses) && data.analysis_focuses.length > 0) {
        const localizedFocuses = localizeAnalysisFocuses(data.analysis_focuses as AnalysisFocusOption[], isZh);
        setAnalysisFocusOptions(localizedFocuses);
        setAnalysisFocusPrompts((prev) => ({
          ...buildDefaultFocusPrompts(localizedFocuses),
          ...prev,
        }));
      }
    } catch {
      // ignore and keep defaults
    }
  }, [isZh]);

  useEffect(() => {
    const nextOptions = isZh ? DEFAULT_ANALYSIS_FOCUS_OPTIONS : EN_ANALYSIS_FOCUS_OPTIONS;
    setReadingProfileOptions(isZh ? DEFAULT_READING_PROFILE_OPTIONS : EN_READING_PROFILE_OPTIONS);
    setAnalysisFocusOptions(nextOptions);
    setAnalysisFocusPrompts((current) => {
      const next = { ...current };
      for (const option of nextOptions) {
        const previousZh = ANALYSIS_FOCUS_LABELS.get(option.value)?.description;
        const previousEn = EN_ANALYSIS_FOCUS_DESCRIPTIONS[option.value];
        const currentValue = current[option.value];
        if (!currentValue || currentValue === previousZh || currentValue === previousEn) {
          next[option.value] = option.description;
        }
      }
      return next;
    });
  }, [isZh]);

  const fetchReadingJobs = useCallback(async () => {
    if (!selectedLibraryId) {
      setRecentReadingJobs([]);
      return;
    }
    try {
      const resp = await fetch(`${API_URL}/api/reading-jobs?library_id=${selectedLibraryId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      setRecentReadingJobs((data.jobs ?? []) as ReadingJob[]);
    } catch {
      setRecentReadingJobs([]);
    }
  }, [selectedLibraryId]);

  const applyAISettings = useCallback((payload: AISettingsResponse) => {
    const nextProviders = payload.providers ?? [];
    const nextSteps = payload.steps ?? [];
    const nextProviderSettings = payload.provider_settings ?? [];
    const nextStepConfigs = payload.step_configs ?? [];
    setAiProviders(nextProviders);
    setAiSteps(nextSteps);
    setProviderSettings(nextProviderSettings);
    setStepConfigs(nextStepConfigs);

    const configurableSteps = nextSteps.filter((step) => step.group === "pipeline");
    const visibleSteps = configurableSteps.length > 0 ? configurableSteps : nextSteps;
    const configMap = new Map(nextStepConfigs.map((config) => [config.step, config]));
    const firstEnabledProvider =
      nextProviderSettings.find((provider) => provider.enabled)?.provider ??
      nextProviderSettings[0]?.provider ??
      nextProviders[0]?.key ??
      "";

    const effectiveConfigs = visibleSteps.map((step) => {
      const config = configMap.get(step.key);
      const provider = config?.provider || step.default_provider || firstEnabledProvider;
      const providerSetting = nextProviderSettings.find((item) => item.provider === provider);
      const providerCatalog = nextProviders.find((item) => item.key === provider);
      return {
        provider,
        model: config?.model || providerSetting?.default_model || providerCatalog?.default_model || "",
      };
    });

    const firstConfig = effectiveConfigs[0];
    const isUnified =
      Boolean(firstConfig) &&
      effectiveConfigs.every(
        (config) => config.provider === firstConfig.provider && config.model === firstConfig.model
      );
    setAiModelMode(isUnified ? "unified" : "per_step");
    setUnifiedProvider(firstConfig?.provider ?? firstEnabledProvider);
    setUnifiedModel(firstConfig?.model ?? "");
  }, []);

  const fetchAISettings = useCallback(async () => {
    setAiSettingsLoading(true);
    setAiSettingsError("");
    try {
      const resp = await fetch(`${API_URL}/api/ai/settings`);
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      applyAISettings(data as AISettingsResponse);
    } catch (error) {
      setAiSettingsError(error instanceof Error ? error.message : "无法读取 AI 设置");
    } finally {
      setAiSettingsLoading(false);
    }
  }, [applyAISettings]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchImportHistory();
  }, [fetchImportHistory]);

  useEffect(() => {
    fetchReadingJobs();
  }, [fetchReadingJobs]);

  useEffect(() => {
    fetchAISettings();
  }, [fetchAISettings]);

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
  const providerSettingMap = useMemo(
    () => new Map(providerSettings.map((provider) => [provider.provider, provider])),
    [providerSettings]
  );
  const stepConfigMap = useMemo(
    () => new Map(stepConfigs.map((config) => [config.step, config])),
    [stepConfigs]
  );
  const configurableAiSteps = useMemo(() => {
    const pipelineSteps = aiSteps.filter((step) => step.group === "pipeline");
    return pipelineSteps.length > 0 ? pipelineSteps : aiSteps;
  }, [aiSteps]);
  const selectedProviderForSummary =
    providerSettingMap.get(unifiedProvider)?.label ??
    aiProviders.find((provider) => provider.key === unifiedProvider)?.label ??
    unifiedProvider;
  const aiModelSummary =
    aiModelMode === "unified"
      ? `${selectedProviderForSummary || copy("Not configured", "未配置")}${unifiedModel ? ` · ${unifiedModel}` : ""}`
      : copy(`Per-step setup · ${configurableAiSteps.length} steps`, `按流程设置 · ${configurableAiSteps.length} 个步骤`);
  const selectedReadingProfile =
    readingProfileOptions.find((option) => option.value === readingProfile) ?? null;
  const selectedAnalysisFocusOptions = analysisFocuses.map((focus) => (
    analysisFocusOptions.find((option) => option.value === focus) ?? {
      value: focus,
      label: focus,
      description: analysisFocusPrompts[focus] ?? "",
    }
  ));
  const activePromptFocus = activeAnalysisFocus && analysisFocuses.includes(activeAnalysisFocus)
    ? activeAnalysisFocus
    : analysisFocuses[0] ?? "";
  const activePromptOption =
    selectedAnalysisFocusOptions.find((option) => option.value === activePromptFocus) ?? null;
  const recommendedFocuses = useMemo(() => {
    const base = readingDepth === "quick"
      ? DEPTH_EXTRA_FOCUSES.quick
      : PAPER_KIND_FOCUSES[paperKind];
    return Array.from(new Set([...base, ...DEPTH_EXTRA_FOCUSES[readingDepth]]));
  }, [paperKind, readingDepth]);
  const recommendedFocusOptions = recommendedFocuses.map((focus) =>
    analysisFocusOptions.find((option) => option.value === focus)
  ).filter((option): option is AnalysisFocusOption => Boolean(option));
  const groupedAnalysisFocusOptions = useMemo(() => {
    const groups = new Map<string, AnalysisFocusOption[]>();
    for (const option of analysisFocusOptions) {
      const category = option.category ?? copy("Custom", "自定义");
      groups.set(category, [...(groups.get(category) ?? []), option]);
    }
    return Array.from(groups.entries());
  }, [analysisFocusOptions, copy]);
  const refreshErrors = summarizeRefreshErrors(refreshResult);

  const updateAIModelStepConfig = (stepKey: string, patch: Partial<AIStepConfig>) => {
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
                unifiedProvider ??
                aiProviders[0]?.key ??
                "",
              model: patch.model ?? "",
            },
          ]
    );
  };

  const getEffectiveStepConfig = (step: AIStepCatalogItem): AIStepConfig => {
    const config = stepConfigMap.get(step.key);
    const provider = config?.provider || step.default_provider || unifiedProvider || aiProviders[0]?.key || "";
    const providerSetting = providerSettingMap.get(provider);
    const providerCatalog = aiProviders.find((item) => item.key === provider);
    return {
      step: step.key,
      provider,
      model: config?.model || providerSetting?.default_model || providerCatalog?.default_model || "",
    };
  };

  const handleSaveAIModelSettings = async () => {
    setAiSettingsSaving(true);
    setAiSettingsError("");
    setAiSettingsMessage("");
    try {
      const currentMap = new Map(stepConfigs.map((config) => [config.step, config]));
      const targetStepKeys = new Set(configurableAiSteps.map((step) => step.key));
      const untouchedConfigs = stepConfigs.filter((config) => !targetStepKeys.has(config.step));
      const targetConfigs =
        aiModelMode === "unified"
          ? configurableAiSteps.map((step) => ({
              step: step.key,
              provider: unifiedProvider || step.default_provider || aiProviders[0]?.key || "",
              model: unifiedModel,
            }))
          : configurableAiSteps.map((step) => {
              const config = currentMap.get(step.key);
              return {
                step: step.key,
                provider: config?.provider || step.default_provider || unifiedProvider || aiProviders[0]?.key || "",
                model: config?.model || "",
              };
            });

      const resp = await fetch(`${API_URL}/api/ai/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_settings: providerSettings,
          step_configs: [...untouchedConfigs, ...targetConfigs],
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      applyAISettings(data as AISettingsResponse);
      setAiSettingsMessage(copy("AI model settings saved.", "AI 模型设置已保存。"));
      setAiModelDialogOpen(false);
    } catch (error) {
      setAiSettingsError(
        error instanceof Error
          ? error.message
          : copy("Could not save AI model settings.", "无法保存 AI 模型设置")
      );
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const toggleAnalysisFocus = (focus: string, checked: boolean) => {
    if (checked) {
      const option = analysisFocusOptions.find((item) => item.value === focus);
      setAnalysisFocusPrompts((prev) => ({
        ...prev,
        [focus]: prev[focus] ?? option?.description ?? "",
      }));
      setActiveAnalysisFocus(focus);
    }
    setAnalysisFocuses((prev) => {
      if (checked) {
        return prev.includes(focus) ? prev : [...prev, focus];
      }
      return prev.filter((item) => item !== focus);
    });
  };

  const applyRecommendedFocuses = useCallback(() => {
    const available = new Set(analysisFocusOptions.map((option) => option.value));
    const nextFocuses = recommendedFocuses.filter((focus) => available.has(focus));
    setAnalysisFocuses(nextFocuses);
    setActiveAnalysisFocus(nextFocuses[0] ?? null);
    setAnalysisFocusPrompts((prev) => {
      const next = { ...prev };
      for (const focus of nextFocuses) {
        const option = analysisFocusOptions.find((item) => item.value === focus);
        next[focus] = next[focus] ?? option?.description ?? focus;
      }
      return next;
    });
    if (readingDepth === "quick") {
      setReadingProfile("title_abstract");
    } else if (readingDepth === "deep") {
      setReadingProfile(paperKind === "writing" ? "style_logic" : "full_content");
    } else {
      setReadingProfile("auto");
    }
  }, [analysisFocusOptions, paperKind, readingDepth, recommendedFocuses]);

  const buildAnalysisFocusPromptMap = useCallback(() => {
    const promptMap: Record<string, string> = {};
    for (const focus of analysisFocuses) {
      const option = analysisFocusOptions.find((item) => item.value === focus);
      const prompt = (analysisFocusPrompts[focus] ?? option?.description ?? focus).trim();
      if (prompt) promptMap[focus] = prompt;
    }
    return promptMap;
  }, [analysisFocusOptions, analysisFocusPrompts, analysisFocuses]);

  const serializeFocuses = () => JSON.stringify(analysisFocuses);
  const serializeFocusPrompts = () => JSON.stringify(buildAnalysisFocusPromptMap());

  const addCustomFocus = () => {
    const label = newFocusLabel.trim();
    const prompt = newFocusPrompt.trim();
    if (!label || !prompt) return;
    const baseValue = slugifyFocusValue(label);
    const existingValues = new Set(analysisFocusOptions.map((option) => option.value));
    const value = existingValues.has(baseValue) ? `${baseValue}_${Date.now()}` : baseValue;
    const option = { value, label, description: prompt, category: copy("Custom", "自定义") };
    setAnalysisFocusOptions((prev) => [...prev, option]);
    setAnalysisFocusPrompts((prev) => ({ ...prev, [value]: prompt }));
    setAnalysisFocuses((prev) => [...prev, value]);
    setActiveAnalysisFocus(value);
    setNewFocusLabel("");
    setNewFocusPrompt("");
  };
  const getAgentStepStatus = (step?: { success?: boolean; skipped?: boolean } | null): StepStatus => {
    if (!step) return "idle";
    if (step.skipped) return "skipped";
    return step.success ? "done" : "error";
  };

  useEffect(() => {
    readingQueueRef.current = readingQueue;
  }, [readingQueue]);

  const updateQueueItem = useCallback((itemId: string, patch: Partial<ReadingQueueItem>) => {
    setReadingQueue((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  }, []);

  const enqueuePapers = useCallback((paperIds: string[], messageByPaperId: Record<string, string> = {}) => {
    const normalizedIds = normalizePaperIds(...paperIds);
    if (normalizedIds.length === 0) return;
    setQueueListOpen(true);

    setReadingQueue((prev) => {
      const activePaperIds = new Set(
        prev
          .filter((item) => item.status === "queued" || item.status === "running")
          .map((item) => item.paperId)
      );
      const nextItems = normalizedIds
        .filter((paperId) => !activePaperIds.has(paperId))
        .map((paperId) => createQueueItem(paperId, messageByPaperId[paperId], isZh));
      return nextItems.length > 0 ? [...prev, ...nextItems] : prev;
    });
  }, [isZh]);

  const applyReadingJob = useCallback((job: ReadingJob, options?: { revealItems?: boolean }) => {
    setActiveReadingJob(job);
    setReadingQueue(queueItemsFromJob(job));
    if (options?.revealItems) {
      setQueueListOpen(true);
    }
    setRecentReadingJobs((prev) => [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 20));
    if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    }
  }, [fetchImportHistory, fetchStatus, loadLibraries]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingIds = normalizePaperIds(params.get("paperId"), params.get("paperIds"));
    const signature = incomingIds.join(",");
    if (!signature || queuedFromParamsRef.current === signature) return;
    queuedFromParamsRef.current = signature;
    enqueuePapers(incomingIds);
  }, [enqueuePapers]);

  const resolveIdentifierToPaperId = useCallback(async (identifier: string) => {
    if (isNberPaperId(identifier)) {
      const paperId = identifier.toLowerCase();
      return {
        paperId,
        message: copy(
          "Recognized as an NBER ID. Reading will use a local PDF first and download it if needed.",
          "已识别为 NBER ID；开始读取时会优先使用本地 PDF，没有本地文件时尝试下载。"
        ),
      };
    }

    if (isDoiIdentifier(identifier)) {
      if (!selectedLibraryId) {
        throw new Error(copy("Choose a target library first.", "请先选择目标文献库。"));
      }
      const doi = normalizeDoiIdentifier(identifier);
      const resp = await fetch(`${API_URL}/api/libraries/${selectedLibraryId}/papers/from-doi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      const paperId = String(data?.paper?.paper_id ?? "").trim().toLowerCase();
      if (!paperId) {
        throw new Error(
          copy("The DOI returned metadata but no usable paper ID.", "DOI 已返回元数据，但缺少可用 paper_id。")
        );
      }
      return {
        paperId,
        message: copy(
          "Recognized as a DOI and imported metadata. Add the full text before reading if no PDF is available.",
          "已识别为 DOI 并导入元数据；如果没有 PDF，读取前需要补充全文。"
        ),
      };
    }

    throw new Error(
      copy(
        `Could not recognize ${identifier}. Enter an NBER ID beginning with w or a DOI.`,
        `无法识别 ${identifier}。请输入 w 开头的 NBER ID 或 DOI。`
      )
    );
  }, [copy, selectedLibraryId]);

  const importIdentifiersToQueue = useCallback(async (identifiers: string[]) => {
    if (identifiers.length === 0) return [];
    setReadingJobError("");
    const paperIds: string[] = [];
    const messageByPaperId: Record<string, string> = {};

    for (const identifier of identifiers) {
      try {
        const resolved = await resolveIdentifierToPaperId(identifier);
        paperIds.push(resolved.paperId);
        if (resolved.message) messageByPaperId[resolved.paperId] = resolved.message;
      } catch (error) {
        setReadingJobError(
          error instanceof Error
            ? error.message
            : copy("Could not recognize the input.", "无法识别输入")
        );
        return [];
      }
    }

    const normalizedPaperIds = normalizePaperIds(...paperIds);
    enqueuePapers(normalizedPaperIds, messageByPaperId);
    if (normalizedPaperIds.length > 0) {
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    }
    return normalizedPaperIds;
  }, [copy, enqueuePapers, fetchImportHistory, fetchStatus, loadLibraries, resolveIdentifierToPaperId]);

  const handleStartQueue = useCallback(async () => {
    if (!selectedLibraryId) {
      setReadingJobError(copy("Choose a target library first.", "请先选择目标文献库。"));
      return;
    }
    const paperIds = readingQueue
      .filter((item) => item.status === "queued")
      .map((item) => item.paperId);
    if (paperIds.length === 0) {
      setReadingJobError(
        copy(
          "No papers are waiting. Upload a PDF, enter an NBER ID or DOI, or retry a failed item.",
          "没有待读取的论文。请先上传 PDF、输入 NBER ID / DOI，或重试失败项。"
        )
      );
      return;
    }
    setReadingJobError("");
    setQueueListOpen(true);
    try {
      const resp = await fetch(`${API_URL}/api/reading-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_ids: paperIds,
          library_id: selectedLibraryId,
          reading_profile: readingProfile,
          analysis_focuses: analysisFocuses,
          analysis_focus_prompts: buildAnalysisFocusPromptMap(),
          custom_reading_instructions: customReadingInstructions,
          update_graph: updateGraphAfterReading,
          update_ideas: updateIdeasAfterReading,
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      applyReadingJob(data.job as ReadingJob, { revealItems: true });
    } catch (error) {
      setReadingJobError(
        error instanceof Error
          ? error.message
          : copy("Could not create the AI reading job.", "无法创建 AI 读取任务")
      );
    }
  }, [analysisFocuses, applyReadingJob, buildAnalysisFocusPromptMap, copy, customReadingInstructions, readingProfile, readingQueue, selectedLibraryId, updateGraphAfterReading, updateIdeasAfterReading]);

  const handleStopQueue = useCallback(async () => {
    if (!activeReadingJob) return;
    setReadingJobError("");
    try {
      const resp = await fetch(`${API_URL}/api/reading-jobs/${activeReadingJob.id}/cancel`, {
        method: "POST",
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      applyReadingJob(data.job as ReadingJob, { revealItems: true });
    } catch (error) {
      setReadingJobError(
        error instanceof Error
          ? error.message
          : copy("Could not stop the AI reading job.", "无法中止 AI 读取任务")
      );
    }
  }, [activeReadingJob, applyReadingJob, copy]);

  const handleRetryQueueItem = useCallback(
    (itemId: string) => {
      updateQueueItem(itemId, {
        status: "queued",
        step: copy("Waiting to read", "等待读取"),
        message: "",
        completedAt: undefined,
      });
    },
    [copy, updateQueueItem]
  );

  const handleCancelQueueItem = useCallback(
    (itemId: string) => {
      const item = readingQueueRef.current.find((entry) => entry.id === itemId);
      if (item?.status === "running") {
        // The backend can only cancel the whole job (no per-paper cancel), so
        // cancelling a running item stops the job — reflect that by marking every
        // not-yet-finished item cancelled, not just this one, to match the server.
        handleStopQueue();
        const now = new Date().toISOString();
        setReadingQueue((prev) =>
          prev.map((entry) =>
            entry.status === "queued" || entry.status === "running"
              ? { ...entry, status: "cancelled", step: copy("Cancelled", "已取消"), completedAt: now }
              : entry
          )
        );
        return;
      }
      updateQueueItem(itemId, {
        status: "cancelled",
        step: copy("Cancelled", "已取消"),
        completedAt: new Date().toISOString(),
      });
    },
    [copy, handleStopQueue, updateQueueItem]
  );

  const handleClearFinishedQueue = useCallback(() => {
    // Never drop our handle on a job that is still running on the server: nulling
    // activeReadingJob stops polling and orphans the live job (no progress shown).
    if (
      activeReadingJob &&
      (activeReadingJob.status === "queued" || activeReadingJob.status === "running")
    ) {
      return;
    }
    setReadingQueue((prev) =>
      prev.filter((item) => item.status === "queued" || item.status === "running")
    );
    setActiveReadingJob(null);
    setReadingJobError("");
    setQueueListOpen(false);
    setExpandedReadingPaperId(null);
    setReadingOutputError("");
  }, [activeReadingJob]);

  const handleToggleReadingOutput = useCallback(async (paperId: string) => {
    if (expandedReadingPaperId === paperId) {
      setExpandedReadingPaperId(null);
      return;
    }
    setExpandedReadingPaperId(paperId);
    setReadingOutputError("");
    if (readingOutputByPaperId[paperId]) return;

    setReadingOutputLoadingId(paperId);
    try {
      const query = selectedLibraryId ? `?library_id=${selectedLibraryId}` : "";
      const resp = await fetch(`${API_URL}/api/papers/${encodeURIComponent(paperId)}/reading-output${query}`);
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      setReadingOutputByPaperId((prev) => ({
        ...prev,
        [paperId]: {
          paper: data?.paper ?? null,
          sections: Array.isArray(data?.sections) ? data.sections : [],
          processing: data?.processing ?? null,
        },
      }));
    } catch (error) {
      setReadingOutputError(
        error instanceof Error
          ? error.message
          : copy("Could not load the structured card.", "无法读取结构化卡片")
      );
    } finally {
      setReadingOutputLoadingId(null);
    }
  }, [copy, expandedReadingPaperId, readingOutputByPaperId, selectedLibraryId]);

  const queuedCount = readingQueue.filter((item) => item.status === "queued").length;
  const runningCount = readingQueue.filter((item) => item.status === "running").length;
  const finishedCount = readingQueue.filter(
    (item) => item.status === "done" || item.status === "error" || item.status === "cancelled"
  ).length;
  const queueRunning = activeReadingJob?.status === "queued" || activeReadingJob?.status === "running";
  const startQueueDisabledReason = queueRunning
    ? copy("A reading job is already running.", "当前已有读取任务正在运行。")
    : !selectedLibraryId
      ? copy("Choose a target library first.", "请先选择目标文献库。")
      : queuedCount === 0
        ? copy(
            "Upload a PDF, enter an NBER ID or DOI, or retry a failed item first.",
            "请先上传 PDF、输入 NBER ID / DOI，或重试失败项。"
          )
        : "";
  const jobProgressPercent =
    activeReadingJob && activeReadingJob.requested > 0
      ? Math.round((activeReadingJob.processed / activeReadingJob.requested) * 100)
      : 0;
  const activeJobUpdatesGraph = Boolean(
    activeReadingJob?.update_graph || activeReadingJob?.update_graph_and_ideas
  );
  const activeJobUpdatesIdeas = Boolean(
    activeReadingJob?.update_ideas || activeReadingJob?.update_graph_and_ideas
  );
  const activePostUpdateTargets = [
    activeJobUpdatesGraph ? "Graph" : null,
    activeJobUpdatesIdeas ? "Ideas" : null,
  ]
    .filter(Boolean)
    .join(" / ");

  // Keep the latest applyReadingJob in a ref so the polling effect can call the
  // current version without re-subscribing whenever its identity changes.
  const applyReadingJobRef = useRef(applyReadingJob);
  applyReadingJobRef.current = applyReadingJob;

  const activeReadingJobId = activeReadingJob?.id;
  const activeReadingJobStatus = activeReadingJob?.status;

  useEffect(() => {
    // Depend on the stable job id (and its status) rather than the whole job
    // object so the 1.5s timer is not torn down/recreated on every poll.
    if (
      !activeReadingJobId ||
      (activeReadingJobStatus !== "queued" && activeReadingJobStatus !== "running")
    ) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const resp = await fetch(`${API_URL}/api/reading-jobs/${activeReadingJobId}`);
        const data = await resp.json().catch(() => null);
        if (!resp.ok) return;
        applyReadingJobRef.current(data.job as ReadingJob);
      } catch {
        // Keep the last known state; the next poll can recover.
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [activeReadingJobId, activeReadingJobStatus]);

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
          analysis_focus_prompts: buildAnalysisFocusPromptMap(),
          custom_reading_instructions: customReadingInstructions,
          update_graph: updateGraphAfterReading,
          update_ideas: updateIdeasAfterReading,
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
          analysis_focus_prompts: buildAnalysisFocusPromptMap(),
          custom_reading_instructions: customReadingInstructions,
          update_graph: updateGraphAfterReading,
          update_ideas: updateIdeasAfterReading,
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
  const handleUpload = async (paperIdOverride = "") => {
    if (!uploadFile) return null;

    if (!isPdfFile(uploadFile)) {
      setUploadError(copy("Choose a PDF file.", "请选择 PDF 文件。"));
      return null;
    }

    // 50 MB limit
    if (uploadFile.size > 50 * 1024 * 1024) {
      setUploadError("File too large. Maximum is 50 MB.");
      return null;
    }

    setUploadStatus("uploading");
    setUploadError("");
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (selectedLibraryId) {
      formData.append("library_id", String(selectedLibraryId));
    }
    if (paperIdOverride.trim()) {
      formData.append("paper_id", paperIdOverride.trim());
    }
    formData.append("reading_profile", readingProfile);
    formData.append("analysis_focuses", serializeFocuses());
    formData.append("analysis_focus_prompts", serializeFocusPrompts());
    formData.append("custom_reading_instructions", customReadingInstructions);

    try {
      const resp = await fetch(`${API_URL}/api/pipeline/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${resp.status}`);
      }
      const paperIdFromResponse = String(data?.paper_id ?? "").trim();
      const status = String(data?.status ?? "");
      const canContinue = (status === "registered" || status === "duplicate") && paperIdFromResponse;
      if (!canContinue) {
        setUploadStatus("error");
        setUploadError(
          data?.error ??
            copy(
              "The PDF was uploaded, but the server did not return a readable paper ID.",
              "PDF 已上传，但没有返回可读取的 paper_id。"
            )
        );
      } else {
        setUploadStatus("done");
        setUploadResult(data);
        fetchStatus();
        fetchImportHistory();
        loadLibraries();
        return data;
      }
    } catch (err) {
      setUploadStatus("error");
      setUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
    }
    return null;
  };

  const handleFolderUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedLibraryId) return;

    const pdfFiles = Array.from(files).filter(isPdfFile);
    if (pdfFiles.length === 0) {
      setUploadError(copy("This folder contains no importable PDFs.", "这个文件夹里没有可导入的 PDF。"));
      return;
    }

    setBatchUploading(true);
    setBatchResult(null);
    setUploadError("");
    setDoiMessage("");
    setRecentImportedPapers([]);

    const formData = new FormData();
    formData.append("library_id", String(selectedLibraryId));
    formData.append("reading_profile", readingProfile);
    formData.append("analysis_focuses", serializeFocuses());
    formData.append("analysis_focus_prompts", serializeFocusPrompts());
    formData.append("custom_reading_instructions", customReadingInstructions);
    pdfFiles.forEach((file) => {
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
      const queueableResults = ((data?.results ?? []) as BatchUploadResult["results"]).filter(
        (item) => (item.status === "registered" || item.status === "duplicate") && item.paper_id
      );
      const queueablePaperIds = normalizePaperIds(...queueableResults.map((item) => item.paper_id));
      if (queueablePaperIds.length > 0 && readingProfile !== "metadata_only") {
        const messageByPaperId = Object.fromEntries(
          queueableResults.map((item) => [
            String(item.paper_id).toLowerCase(),
            item.status === "duplicate"
              ? copy("The PDF already exists and was added to the reading queue.", "PDF 已存在，已加入读取队列。")
              : copy("The PDF was imported, cached, and added to the reading queue.", "PDF 已导入并生成文本缓存，已加入读取队列。"),
          ])
        );
        enqueuePapers(queueablePaperIds, messageByPaperId);
        setQueueListOpen(true);
        setRecentImportedPapers(
          queueablePaperIds.map((paperId) => ({ paperId, note: messageByPaperId[paperId] }))
        );
        setDoiMessage(
          copy(
            `Imported ${queueablePaperIds.length} PDFs and added them to the queue. Confirm the settings, then click Start reading.`,
            `已导入 ${queueablePaperIds.length} 篇 PDF 并加入下方读取队列。确认读取设置后，点击“开始读取”。`
          )
        );
      } else if (readingProfile === "metadata_only") {
        setDoiMessage(copy("The PDFs were registered as metadata only; AI reading is not required.", "PDF 已登记为元数据模式，不需要运行 AI 读取。"));
      }
      fetchStatus();
      fetchImportHistory();
      loadLibraries();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Batch upload failed");
    } finally {
      setBatchUploading(false);
    }
  };

  const handleImportLiterature = async () => {
    const identifiers = splitQueueIdentifiers(importIdentifier);
    if (!selectedLibraryId) {
      setUploadError(copy("Choose a target library first.", "请先选择目标文献库。"));
      return;
    }
    if (!uploadFile && identifiers.length === 0) {
      setUploadError(copy("Enter an NBER ID or DOI, or upload a PDF.", "请输入 NBER ID / DOI，或上传 PDF。"));
      return;
    }
    if (uploadFile && identifiers.length > 1) {
      setUploadError(
        copy(
          "A single PDF can be linked to only one NBER ID or DOI.",
          "上传单个 PDF 时只能绑定一个 NBER ID 或 DOI。"
        )
      );
      return;
    }
    setDoiLoading(true);
    setDoiMessage("");
    setRecentImportedPapers([]);
    setUploadError("");
    try {
      if (uploadFile) {
        let paperId = "";
        if (identifiers.length === 1) {
          const resolved = await resolveIdentifierToPaperId(identifiers[0]);
          paperId = resolved.paperId;
        }
        const uploadData = await handleUpload(paperId);
        const uploadedPaperId = String(uploadData?.paper_id ?? "").trim().toLowerCase();
        if (uploadedPaperId) {
          setImportIdentifier("");
          if (readingProfile === "metadata_only") {
            setRecentImportedPapers([
              { paperId: uploadedPaperId, note: copy("Registered as metadata only", "已登记为元数据模式") },
            ]);
            setDoiMessage(copy("The PDF was registered as metadata only; AI reading is not required.", "PDF 已登记为元数据模式，不需要运行 AI 读取。"));
          } else {
            const note =
              uploadData?.status === "duplicate"
                ? copy("The PDF already exists and was added to the reading queue.", "PDF 已存在，已加入读取队列。")
                : copy("The PDF was imported, cached, and added to the reading queue.", "PDF 已导入并生成文本缓存，已加入读取队列。");
            enqueuePapers([uploadedPaperId], { [uploadedPaperId]: note });
            setQueueListOpen(true);
            setRecentImportedPapers([{ paperId: uploadedPaperId, note }]);
            setDoiMessage(
              copy(
                "The PDF was added to the queue. Confirm the settings, then click Start reading.",
                "PDF 已加入下方读取队列。确认读取设置后，点击“开始读取”。"
              )
            );
          }
        }
        return;
      }

      const paperIds = await importIdentifiersToQueue(identifiers);
      if (paperIds.length > 0) {
        setImportIdentifier("");
        setRecentImportedPapers(
          paperIds.map((paperId) => ({ paperId, note: copy("Added to reading queue", "已加入读取队列") }))
        );
        setDoiMessage(
          copy(
            `Imported ${paperIds.length} papers and added them to the queue. Confirm the settings, then click Start reading.`,
            `已导入 ${paperIds.length} 篇文献并加入下方读取队列。确认读取设置后，点击“开始读取”。`
          )
        );
      }
    } catch (err) {
      setDoiMessage("");
      setUploadError(err instanceof Error ? err.message : copy("Paper import failed.", "导入文献失败"));
    } finally {
      setDoiLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isPdfFile(file)) {
      setUploadFile(file);
      setUploadStatus("idle");
      setUploadError("");
      setUploadResult(null);
    } else if (file) {
      setUploadError(copy("Choose a PDF file.", "请选择 PDF 文件。"));
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

  const readingSettingsContent = (
    <div className="grid gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="lit-workbench p-3">
        <div className="grid gap-2">
          <label
            className="grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-2"
            title={isZh ? PAPER_KIND_OPTIONS.find((option) => option.value === paperKind)?.description : PAPER_KIND_OPTIONS.find((option) => option.value === paperKind)?.descriptionEn}
          >
            <span className="text-sm font-medium text-[var(--ink-4)]">{copy("Type", "类型")}</span>
            <Select value={paperKind} onValueChange={(value) => setPaperKind(value as PaperKind)}>
              <SelectTrigger className="lit-control-select h-9 text-sm">
                <SelectValue placeholder={copy("Paper type", "论文类型")} />
              </SelectTrigger>
              <SelectContent>
                {PAPER_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {isZh ? option.label : option.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label
            className="grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-2"
            title={isZh ? READING_DEPTH_OPTIONS.find((option) => option.value === readingDepth)?.description : READING_DEPTH_OPTIONS.find((option) => option.value === readingDepth)?.descriptionEn}
          >
            <span className="text-sm font-medium text-[var(--ink-4)]">{copy("Depth", "深度")}</span>
            <Select value={readingDepth} onValueChange={(value) => setReadingDepth(value as ReadingDepth)}>
              <SelectTrigger className="lit-control-select h-9 text-sm">
                <SelectValue placeholder={copy("Reading depth", "阅读深度")} />
              </SelectTrigger>
              <SelectContent>
                {READING_DEPTH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {isZh ? option.label : option.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label
            className="grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-2"
            title={selectedReadingProfile?.description ?? copy("Choose a reading mode and default focus areas.", "选择读取方式和默认关注方向。")}
          >
            <span className="text-sm font-medium text-[var(--ink-4)]">{copy("Mode", "方式")}</span>
            <Select
              value={readingProfile}
              onValueChange={(value) => {
                setReadingProfile(value);
                if (value === "custom" && !customReadingInstructions.trim()) {
                  setCustomReadingInstructions(
                    copy(
                      "Read the paper using the dimensions selected and edited below, prioritizing reusable structured findings.",
                      "按我在下方选择和编辑的维度读取论文，并优先输出可复用的结构化发现。"
                    )
                  );
                }
              }}
            >
              <SelectTrigger className="lit-control-select h-9 text-sm">
                <SelectValue placeholder={copy("Reading mode", "读取方式")} />
              </SelectTrigger>
              <SelectContent>
                {readingProfileOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setReadingProfile(readingProfile === "section_batch" ? "auto" : "section_batch")}
          title={copy("Read long papers section by section before merging them into a structured card. This is slower but improves coverage.", "长论文可先按 Introduction、Data、Results 等小节逐段读取，再汇总成结构化卡片。速度更慢，但覆盖更完整。")}
          className={`mt-3 flex w-full items-center justify-between rounded-[var(--r)] border px-3 py-2 text-left text-sm ${
            readingProfile === "section_batch"
              ? "border-[var(--forest)]/70 bg-[var(--paper-2)] text-[var(--ink)]"
              : "border-[var(--line-soft)] bg-[var(--paper)]/60 text-[var(--ink-4)] hover:text-[var(--ink)]"
          }`}
        >
          <span className="font-medium">{copy("Section-by-section reading", "长文分节读取")}</span>
          <span className="font-mono text-xs">{readingProfile === "section_batch" ? "ON" : "OFF"}</span>
        </button>

        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onClick={() => setUpdateGraphAfterReading((value) => !value)}
            title={copy("After the queue finishes, run Linker to merge new paper cards into Graph and Atlas. When off, only cards and atoms are updated.", "开启后，队列读完会运行 Linker，把新 paper cards 合并进 Graph/Atlas maps。关闭后只更新论文卡片和 atoms。")}
            className={`flex w-full items-center justify-between rounded-[var(--r)] border px-3 py-2 text-left text-sm ${
              updateGraphAfterReading
                ? "border-[var(--forest)]/70 bg-[var(--paper-2)] text-[var(--ink)]"
                : "border-[var(--line-soft)] bg-[var(--paper)]/60 text-[var(--ink-4)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <Network className="h-3.5 w-3.5 shrink-0" />
              <span>{copy("Update Graph after reading", "读完更新 Graph")}</span>
            </span>
            <span className="font-mono text-xs">{updateGraphAfterReading ? "ON" : "OFF"}</span>
          </button>

          <button
            type="button"
            onClick={() => setUpdateIdeasAfterReading((value) => !value)}
            title={copy("After the queue finishes, run Thinker and Critic over Graph and Atlas to generate and evaluate ideas. Linker runs first when needed.", "开启后，队列读完会基于 Graph/Atlas 运行 Thinker 和 Critic，生成并评估 Ideas；如果有新论文尚未入图，后端会先运行 Linker。")}
            className={`flex w-full items-center justify-between rounded-[var(--r)] border px-3 py-2 text-left text-sm ${
              updateIdeasAfterReading
                ? "border-[var(--forest)]/70 bg-[var(--paper-2)] text-[var(--ink)]"
                : "border-[var(--line-soft)] bg-[var(--paper)]/60 text-[var(--ink-4)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>{copy("Update Ideas after reading", "读完更新 Ideas")}</span>
            </span>
            <span className="font-mono text-xs">{updateIdeasAfterReading ? "ON" : "OFF"}</span>
          </button>
        </div>

        <div className="mt-3 rounded-[var(--r)] border border-[var(--line-soft)] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--ink-4)]">{copy("Recommended", "推荐")}</span>
            <span className="lit-chip-muted">{recommendedFocusOptions.length}</span>
          </div>
          <div className="max-h-24 overflow-auto pr-1">
            <div className="flex flex-wrap gap-1.5">
              {recommendedFocusOptions.map((option) => (
                <span key={option.value} title={option.description} className="lit-chip-muted">
                  {option.label}
                </span>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyRecommendedFocuses}
            className="mt-2 h-8 w-full gap-1.5 px-2 text-sm"
            title={copy("Replace the selected dimensions using the current paper type and reading depth.", "按当前论文类型和阅读深度替换选中维度。")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {copy("Apply recommendation", "应用推荐")}
          </Button>
        </div>

        {readingProfile === "custom" ? (
          <textarea
            value={customReadingInstructions}
            onChange={(event) => setCustomReadingInstructions(event.target.value)}
            placeholder={copy("Custom reading instructions", "自定义读取说明")}
            className="mt-3 min-h-[74px] w-full resize-y rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--forest)]"
          />
        ) : null}
      </aside>

      <div className="lit-workbench min-w-0 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line-soft)] pb-2">
          <p className="text-sm font-semibold text-[var(--ink)]">{copy("Reading dimensions", "读取维度")}</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[var(--line-soft)] px-2.5 py-1 font-mono text-sm">
              {selectedAnalysisFocusOptions.length} / {analysisFocusOptions.length}
            </span>
            <Button
              type="button"
              variant={promptEditorOpen ? "secondary" : "outline"}
              size="sm"
              onClick={() => setPromptEditorOpen((value) => !value)}
              disabled={selectedAnalysisFocusOptions.length === 0}
              className="h-8 gap-1.5 px-2.5 text-sm"
              title={copy("Expand to edit the prompt for each selected dimension.", "展开后可以修改每个选中维度的提示词。")}
            >
              {promptEditorOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {copy("Edit prompts", "编辑提示词")}
            </Button>
          </div>
        </div>

        <div className="lit-dimension-panel mt-3 md:grid-cols-2 2xl:grid-cols-3">
          {groupedAnalysisFocusOptions.map(([category, options]) => (
            <div key={category} className="lit-dimension-row">
              <p className="lit-dimension-label">{category}</p>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {options.map((option) => {
                  const selected = analysisFocuses.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      title={analysisFocusPrompts[option.value] ?? option.description}
                      className="lit-choice"
                      data-selected={selected ? "true" : "false"}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) =>
                          toggleAnalysisFocus(option.value, checked === true)
                        }
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 border-t border-[var(--line-soft)] pt-3 lg:grid-cols-[160px_minmax(0,1fr)_auto]">
          <Input
            value={newFocusLabel}
            onChange={(event) => setNewFocusLabel(event.target.value)}
            placeholder={copy("New dimension", "新增维度")}
            className="h-9 rounded-[var(--r)] text-sm"
          />
          <Input
            value={newFocusPrompt}
            onChange={(event) => setNewFocusPrompt(event.target.value)}
            placeholder={copy("What should the AI inspect for this dimension?", "这个维度具体让 AI 看什么")}
            className="h-9 rounded-[var(--r)] text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCustomFocus}
            disabled={!newFocusLabel.trim() || !newFocusPrompt.trim()}
            className="h-9 text-sm"
          >
            {copy("Add", "添加")}
          </Button>
        </div>

        {promptEditorOpen && selectedAnalysisFocusOptions.length > 0 ? (
          <div className="mt-3 rounded-[var(--r)] border border-[var(--line-soft)]/80 bg-[var(--paper)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-[var(--ink-4)]">{copy("Selected dimensions", "选中维度")}</p>
              <Badge variant="outline" className="h-6 px-2 text-xs">
                {selectedAnalysisFocusOptions.length}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAnalysisFocuses([]);
                setActiveAnalysisFocus(null);
                setPromptEditorOpen(false);
              }}
              disabled={analysisFocuses.length === 0}
              className="h-8 px-2.5 text-sm"
            >
              {copy("Clear", "清空")}
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedAnalysisFocusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveAnalysisFocus(option.value)}
                title={analysisFocusPrompts[option.value] ?? option.description}
                className={`inline-flex h-8 items-center gap-1.5 rounded-[var(--r)] border px-2.5 text-sm transition-colors ${
                  option.value === activePromptFocus
                    ? "border-[var(--forest)]/70 bg-[var(--forest-soft)] text-[var(--ink)]"
                    : "border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink-4)] hover:text-[var(--ink)]"
                }`}
              >
                <span>{option.label}</span>
                <span className="text-xs opacity-70">{option.category ?? copy("Custom", "自定义")}</span>
              </button>
            ))}
          </div>

          {activePromptOption ? (
            <div className="mt-3 grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--ink)]">
                  {activePromptOption.label}
                </p>
                <p className="mt-1 text-sm text-[var(--ink-4)]">
                  {activePromptOption.category ?? copy("Custom", "自定义")}
                </p>
              </div>
              <textarea
                value={analysisFocusPrompts[activePromptOption.value] ?? activePromptOption.description}
                onChange={(event) =>
                  setAnalysisFocusPrompts((prev) => ({
                    ...prev,
                    [activePromptOption.value]: event.target.value,
                  }))
                }
                className="min-h-[64px] w-full resize-y rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--forest)]"
              />
            </div>
          ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const showAdvancedTools = false;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="lit-paper-head pb-4">
        <p className="lit-paper-id">Import desk</p>
        <h2 className="font-display mt-2 text-3xl text-[var(--ink)]">
          {copy("Import Center", "导入中心")}
        </h2>
      </div>

      {libraries.length > 0 && (
        <div className="lit-workbench flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="lit-paper-id">Target library</span>
          <select
            value={selectedLibraryId ?? ""}
            onChange={(event) => {
              if (event.target.value === CREATE_LIBRARY_SELECT_VALUE) {
                setCreateLibraryError("");
                setCreateLibraryOpen(true);
                return;
              }
              const nextId = Number(event.target.value) || null;
              setSelectedLibraryId(nextId);
              setStoredActiveLibraryId(nextId);
            }}
            className="lit-control-select h-9 min-w-[220px] rounded-[var(--r)] px-3 text-sm text-[var(--ink)]"
          >
            {libraries.map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
            <option value={CREATE_LIBRARY_SELECT_VALUE}>{copy("+ New library", "+ 新增数据库")}</option>
          </select>
        </div>
      )}

      <Card className="order-2 overflow-hidden border-[var(--line-soft)] bg-[var(--paper)]/80 shadow-none">
        <CardHeader className="border-b border-[var(--line-soft)] p-0">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] text-[var(--forest)]">
                <ListChecks className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle
                  className="text-lg font-semibold tracking-tight"
                  title={copy("Import a PDF, NBER ID, or DOI above, then process the queue with the current reading settings.", "先在上方导入 PDF、NBER ID 或 DOI，再用当前读取设置逐篇处理队列。")}
                >
                  {copy("AI reading", "AI 读取")}
                </CardTitle>
                <p className="mt-1 text-sm text-[var(--ink-4)]">
                  {activeReadingJob
                    ? copy(`Job ${activeReadingJob.id.slice(0, 8)} · ${activeReadingJob.processed}/${activeReadingJob.requested}`, `任务 ${activeReadingJob.id.slice(0, 8)} · ${activeReadingJob.processed}/${activeReadingJob.requested}`)
                    : copy("Queue, progress, and cancellation", "队列、进度、中止")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
              {[
                [copy("Queued", "等待"), queuedCount],
                [copy("Running", "运行"), runningCount],
                [copy("Finished", "结束"), finishedCount],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)]/60 px-3 py-2 text-center"
                >
                  <div className="text-lg font-semibold leading-none text-[var(--ink)]">{value}</div>
                  <div className="mt-1 text-sm text-[var(--ink-4)]">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-1 bg-[var(--paper-2)]/40">
            <div
              className="h-full bg-[var(--ink)] transition-[width] duration-500 ease-out"
              style={{ width: `${jobProgressPercent}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <section className="lit-workbench space-y-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3
                className="text-sm font-semibold text-[var(--ink)]"
                title={copy("Choose the reading method and dimensions before starting the queue.", "先指定读取方法和维度，再启动队列。")}
              >
                {copy("Reading settings", "读取设置")}
              </h3>
            </div>
            {readingSettingsContent}
          </section>

          <div className="lit-workbench flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 text-sm text-[var(--ink-4)]">
              <span className="truncate">{aiSettingsLoading ? copy("Loading model settings...", "正在读取模型设置...") : aiModelSummary}</span>
              {aiSettingsMessage ? (
                <span className="ml-2 text-[var(--forest)]">{aiSettingsMessage}</span>
              ) : null}
              {activePostUpdateTargets ? (
                <span
                  className={`ml-2 ${
                    activeReadingJob?.post_reading_update?.status === "error"
                      ? "text-[#8a3318]"
                      : activeReadingJob?.post_reading_update?.status === "done"
                        ? "text-[var(--forest)]"
                        : "text-[var(--ink-4)]"
                  }`}
                  title={
                    activeReadingJob?.post_reading_update?.message
                      ? localizeReadingJobText(activeReadingJob.post_reading_update.message, isZh)
                      : copy(`Update ${activePostUpdateTargets} after the queue finishes`, `队列读完后更新 ${activePostUpdateTargets}`)
                  }
                >
                  {activePostUpdateTargets}: {activeReadingJob?.post_reading_update?.step
                    ? localizeReadingJobText(activeReadingJob.post_reading_update.step, isZh)
                    : copy("Waiting for reading to finish", "等待读取完成")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleStartQueue}
                disabled={queueRunning || queuedCount === 0 || !selectedLibraryId}
                className="h-10 gap-2 px-5"
                title={startQueueDisabledReason || copy(`Read ${queuedCount} papers`, `读取 ${queuedCount} 篇论文`)}
              >
                {queueRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {copy("Start reading", "开始读取")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleStopQueue}
                disabled={!queueRunning}
                className="h-10 gap-2"
                title={copy("Stop the current job and do not process the remaining queue.", "请求中止当前任务，并停止继续处理后续队列。")}
              >
                <PauseCircle className="h-4 w-4" />
                {copy("Stop", "中止")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClearFinishedQueue}
                disabled={finishedCount === 0 || queueRunning}
                className="h-10 gap-2"
                title={copy("Remove completed, failed, and cancelled queue items.", "清理已完成、失败或已取消的队列项。")}
              >
                <Trash2 className="h-4 w-4" />
                {copy("Clear", "清理")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAiSettingsMessage("");
                  setAiSettingsError("");
                  setAiModelDialogOpen(true);
                }}
                className="h-10 gap-2"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {copy("AI model", "AI 模型")}
              </Button>
            </div>
          </div>

          {startQueueDisabledReason && !queueRunning ? (
            <p className="-mt-2 text-sm text-[var(--ink-4)]">{startQueueDisabledReason}</p>
          ) : null}

          {readingJobError ? (
            <div className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] px-3 py-2 text-sm text-[#8a3318]">
              {readingJobError}
            </div>
          ) : null}

          {recentReadingJobs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-4)]">
              <span className="font-medium text-[var(--ink)]">{copy("Recent jobs", "最近任务")}</span>
              {recentReadingJobs.slice(0, 4).map((job) => (
                <Button
                  key={job.id}
                  type="button"
                  variant={activeReadingJob?.id === job.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    const sameJob = activeReadingJob?.id === job.id;
                    applyReadingJob(job, { revealItems: true });
                    setQueueListOpen(sameJob ? !queueListOpen : true);
                  }}
                  className="h-8 gap-1.5 px-2.5 text-sm"
                  title={copy(`Job ${job.id}, ${job.processed}/${job.requested}`, `任务 ${job.id}，${job.processed}/${job.requested}`)}
                >
                  <span className="font-mono">{job.id.slice(0, 6)}</span>
                  <span>{queueStatusLabel(job.status, isZh)}</span>
                  <span>{job.processed}/{job.requested}</span>
                  {activeReadingJob?.id === job.id && queueListOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </Button>
              ))}
            </div>
          ) : null}

          {readingQueue.length > 0 && queueListOpen ? (
            <div className="space-y-2">
              {readingQueue.map((item) => {
                const output = readingOutputByPaperId[item.paperId];
                const outputOpen = expandedReadingPaperId === item.paperId;
                return (
                  <div
                    key={item.id}
                    className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)]/60 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium text-[var(--ink)]">
                            {item.paperId}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-sm font-medium ${queueStatusClass(item.status)}`}
                          >
                            {queueStatusLabel(item.status, isZh)}
                          </span>
                          <span className="text-sm text-[var(--ink-4)]">
                            {localizeReadingJobText(item.step, isZh)}
                          </span>
                        </div>
                        {item.message ? (
                          item.status === "done" ? (
                            <button
                              type="button"
                              onClick={() => void handleToggleReadingOutput(item.paperId)}
                              className="mt-1 text-left text-sm text-[var(--ink-4)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
                            >
                              {compactQueueMessage(localizeReadingJobText(item.message, isZh))}
                            </button>
                          ) : (
                            <p className="mt-1 text-sm text-[var(--ink-4)]">
                              {compactQueueMessage(localizeReadingJobText(item.message, isZh))}
                            </p>
                          )
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.status === "done" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleToggleReadingOutput(item.paperId)}
                            className="h-8 gap-1.5 px-2.5 text-sm"
                          >
                            {outputOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {copy("Extracted content", "提取内容")}
                          </Button>
                        ) : null}
                        {item.status === "error" || item.status === "cancelled" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRetryQueueItem(item.id)}
                            className="h-8 gap-1.5 px-2.5 text-sm"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {copy("Retry", "重试")}
                          </Button>
                        ) : null}
                        {item.status === "queued" || item.status === "running" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancelQueueItem(item.id)}
                            className="h-8 gap-1.5 px-2.5 text-sm"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {copy("Cancel", "取消")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {outputOpen ? (
                      <div className="mt-3 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-3">
                        {readingOutputLoadingId === item.paperId ? (
                          <div className="flex items-center gap-2 text-sm text-[var(--ink-4)]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {copy("Loading the structured card...", "正在读取结构化卡片……")}
                          </div>
                        ) : output ? (
                          <div className="space-y-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--ink)]">
                                {output.paper?.title || item.paperId}
                              </p>
                              <p className="mt-1 text-xs text-[var(--ink-4)]">
                                {copy(`${output.sections.length} structured sections`, `${output.sections.length} 张结构化卡片`)}
                                {output.processing?.reading_profile ? ` · ${output.processing.reading_profile}` : ""}
                              </p>
                            </div>
                            {output.sections.length > 0 ? (
                              <div className="grid gap-2 md:grid-cols-2">
                                {output.sections.slice(0, 8).map((section) => (
                                  <div
                                    key={section.section}
                                    className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2"
                                  >
                                    <p className="text-xs font-medium text-[var(--ink-4)]">
                                      {section.section}
                                    </p>
                                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[var(--ink)]">
                                      {section.content}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--ink-4)]">{copy("No structured card has been generated yet.", "尚未生成结构化卡片。")}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-[#8a3318]">
                            {readingOutputError || copy("The structured card is temporarily unavailable.", "暂时无法读取结构化卡片。")}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : readingQueue.length === 0 ? (
            <div
              className="flex min-h-[112px] items-center justify-center rounded-[var(--r)] border border-dashed border-[var(--line-soft)]/80 bg-[var(--paper)]/35 px-4 py-6 text-center"
              title={copy("Choose AI reading from a paper action menu, or enter an NBER ID or DOI here.", "从文献浏览器的论文操作菜单选择 AI 读取，或在这里输入 NBER ID / DOI。")}
            >
              <div>
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] text-[var(--ink-4)]">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-[var(--ink)]">{copy("No papers are waiting", "暂无待读取论文")}</p>
                <p className="mt-1 text-sm text-[var(--ink-4)]">{copy("Add papers from the library, or enter an NBER ID or DOI.", "从文献浏览器加入，或输入 NBER ID / DOI。")}</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setQueueListOpen(true)}
              className="flex w-full items-center justify-between rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-left text-sm text-[var(--ink-4)] hover:text-[var(--ink)]"
            >
              <span>{copy(`${readingQueue.length} papers in the queue`, `${readingQueue.length} 篇论文在队列中`)}</span>
              <span className="inline-flex items-center gap-1">
                {copy("Expand queue", "展开队列")}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          )}
        </CardContent>
      </Card>

      <Dialog open={aiModelDialogOpen} onOpenChange={setAiModelDialogOpen}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy("AI model selection", "AI 模型选择")}</DialogTitle>
            <DialogDescription>
              {copy("These settings update the global AI configuration used by Reader and related pipeline steps.", "这些设置会写入全局 AI 配置，后续 Reader 和相关流程会按这里选择的模型运行。")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)]/50 p-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={aiModelMode === "unified" ? "secondary" : "ghost"}
                onClick={() => setAiModelMode("unified")}
                className="justify-start"
              >
                {copy("One model", "统一模型")}
              </Button>
              <Button
                type="button"
                variant={aiModelMode === "per_step" ? "secondary" : "ghost"}
                onClick={() => setAiModelMode("per_step")}
                className="justify-start"
              >
                {copy("Per-step models", "按流程设置")}
              </Button>
            </div>

            {aiSettingsLoading ? (
              <div className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-4 text-sm text-[var(--ink-4)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {copy("Loading AI configuration", "正在读取 AI 配置")}
              </div>
            ) : aiModelMode === "unified" ? (
              <div className="grid gap-3 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[var(--ink)]">Provider</p>
                  <Select value={unifiedProvider} onValueChange={setUnifiedProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder={copy("Choose provider", "选择 Provider")} />
                    </SelectTrigger>
                    <SelectContent>
                      {aiProviders.map((provider) => (
                        <SelectItem key={provider.key} value={provider.key}>
                          {providerSettingMap.get(provider.key)?.label ?? provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[var(--ink)]">Model</p>
                  <Input
                    value={unifiedModel}
                    onChange={(event) => setUnifiedModel(event.target.value)}
                    placeholder={
                      providerSettingMap.get(unifiedProvider)?.default_model ||
                      aiProviders.find((provider) => provider.key === unifiedProvider)?.default_model ||
                      copy("Enter model name", "输入模型名称")
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {configurableAiSteps.map((step) => {
                  const config = getEffectiveStepConfig(step);
                  return (
                    <div
                      key={step.key}
                      className="grid gap-3 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-4 lg:grid-cols-[minmax(0,1fr)_200px_minmax(180px,1fr)]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--ink)]">{step.label}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-4)]">
                          {step.description}
                        </p>
                      </div>
                      <Select
                        value={config.provider}
                        onValueChange={(provider) => updateAIModelStepConfig(step.key, { provider })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {aiProviders.map((provider) => (
                            <SelectItem key={provider.key} value={provider.key}>
                              {providerSettingMap.get(provider.key)?.label ?? provider.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={config.model}
                        onChange={(event) => updateAIModelStepConfig(step.key, { model: event.target.value })}
                        placeholder={
                          providerSettingMap.get(config.provider)?.default_model ||
                          aiProviders.find((provider) => provider.key === config.provider)?.default_model ||
                          copy("Model name", "模型名称")
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {aiSettingsError ? (
              <div className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] px-3 py-2 text-sm text-[#8a3318]">
                {aiSettingsError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAiModelDialogOpen(false)}
              disabled={aiSettingsSaving}
            >
              {copy("Cancel", "取消")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveAIModelSettings}
              disabled={aiSettingsSaving || aiSettingsLoading || aiProviders.length === 0}
              className="gap-2"
            >
              {aiSettingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copy("Save", "保存")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createLibraryOpen} onOpenChange={setCreateLibraryOpen}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy("New library", "新增数据库")}</DialogTitle>
            <DialogDescription>
              {copy(
                "Set the library name, discipline, and storage locations. Empty paths are created automatically from the name.",
                "设定新的文献库名称、学科和存储位置。路径留空时会按名称自动创建。"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--ink)]">
                {copy("Library name", "数据库名称")}
              </label>
              <Input
                value={newLibraryName}
                onChange={(event) => setNewLibraryName(event.target.value)}
                placeholder={copy("For example, Health Economics Library", "例如 Health Economics Library")}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--ink)]">
                {copy("Discipline / topic", "学科 / 主题")}
              </label>
              <Input
                value={newLibraryDiscipline}
                onChange={(event) => setNewLibraryDiscipline(event.target.value)}
                placeholder={copy("For example, Health Economics", "例如 Health Economics")}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--ink)]">
                {copy("Description", "说明")}
              </label>
              <textarea
                value={newLibraryDescription}
                onChange={(event) => setNewLibraryDescription(event.target.value)}
                placeholder={copy(
                  "What papers belong here, and which research workflow does this library support?",
                  "这个数据库主要收什么论文、服务什么研究场景"
                )}
                className="min-h-[84px] w-full resize-y rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--forest)]"
              />
            </div>
            <div className="grid gap-3 rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-3">
              <p className="text-sm font-medium text-[var(--ink)]">
                {copy("Advanced paths", "高级路径")}
              </p>
              <Input
                value={newLibraryPapersDir}
                onChange={(event) => setNewLibraryPapersDir(event.target.value)}
                placeholder={copy("PDF directory; leave empty to create automatically", "PDF 目录，留空自动生成")}
              />
              <Input
                value={newLibraryKnowledgeDir}
                onChange={(event) => setNewLibraryKnowledgeDir(event.target.value)}
                placeholder={copy("Knowledge base directory; leave empty to create automatically", "知识库目录，留空自动生成")}
              />
              <Input
                value={newLibraryAgentDbPath}
                onChange={(event) => setNewLibraryAgentDbPath(event.target.value)}
                placeholder={copy("Agent database path; leave empty to create automatically", "Agent DB 路径，留空自动生成")}
              />
            </div>
            {createLibraryError ? (
              <div className="rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] px-3 py-2 text-sm text-[#8a3318]">
                {createLibraryError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateLibraryOpen(false)}
              disabled={createLibraryLoading}
            >
              {copy("Cancel", "取消")}
            </Button>
            <Button
              type="button"
              onClick={handleCreateLibrary}
              disabled={createLibraryLoading || !newLibraryName.trim()}
              className="gap-2"
            >
              {createLibraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {copy("Create and switch", "创建并切换")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAdvancedTools && !appConfig.supportsRemoteDiscovery && (
        <div className="rounded-[var(--r)] border border-dashed border-[var(--line-soft)] bg-[var(--paper-2)]/20 px-4 py-3 text-sm text-[var(--ink-4)]">
          当前工作区未启用远程发现。请通过 PDF 上传建立本地文献库。
        </div>
      )}

      {/* ================================================================ */}
      {/* Section 1: Pipeline Status */}
      {/* ================================================================ */}
      {showAdvancedTools ? (
      <>
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
                <p className="text-sm font-medium text-[var(--ink)]">
                  {selectedLibrary.name}
                </p>
                <p className="text-xs text-[var(--ink-4)]">
                  {selectedLibrary.discipline || "未分类"} · {selectedLibrary.paper_count} 篇论文
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <SummaryPill label="地图" value={selectedLibrary.field_map_count} />
                <SummaryPill label="想法" value={selectedLibrary.idea_count} />
                <SummaryPill label="摘要" value={selectedLibrary.digest_count} />
                <SummaryPill label="导入批次" value={selectedLibrary.import_batch_count} />
              </div>
              <div className="grid gap-2 text-xs text-[var(--ink-4)] md:grid-cols-2">
                <p>
                  最新摘要：<span className="font-medium text-[var(--ink)]">{selectedLibrary.latest_digest_date ?? "无"}</span>
                </p>
                <p>
                  最新想法：<span className="font-medium text-[var(--ink)]">{selectedLibrary.latest_idea_date ?? "无"}</span>
                </p>
              </div>
              <p className="text-xs text-[var(--ink-4)]">
                用这里检查当前文献库是否已有地图、想法、摘要和导入记录。
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-4)]">
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
            <div className="mb-4 rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] px-3 py-2 text-sm text-[#742b14]">
              {statusError}
            </div>
          )}
          {pipelineStatus ? (
            <div className="space-y-4">
              {/* Count badges */}
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "总数", key: "total", color: "bg-[var(--paper-2)] text-[var(--ink-2)]" },
                  { label: "待处理", key: "pending", color: "bg-[#f4ead8] text-[#654814]" },
                  { label: "已完成", key: "completed", color: "bg-[var(--forest-soft)] text-[var(--forest-2)]" },
                  { label: "错误", key: "error", color: "bg-[#f4dfd5] text-[#742b14]" },
                ].map(({ label, key, color }) => (
                  <div
                    key={key}
                    className={`rounded-[var(--r)] px-3 py-2 text-center ${color}`}
                  >
                    <div className="text-lg font-bold">
                      {pipelineStatus.counts[key] ?? 0}
                    </div>
                    <div className="text-xs">{label}</div>
                  </div>
                ))}
              </div>

              {/* Downloaded PDFs */}
              <p className="text-xs text-[var(--ink-4)]">
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
                  className={`rounded-[var(--r)] border p-3 text-sm ${
                    pipelineResult.success
                      ? "border-[var(--forest)] bg-[var(--forest-soft)] text-[var(--forest-2)]"
                      : "border-[#da9a80] bg-[#f4dfd5] text-[#742b14]"
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
                  className={`rounded-[var(--r)] border p-3 text-sm ${
                    refreshErrors.length > 0
                      ? "border-[#da9a80] bg-[#f4dfd5] text-[#742b14]"
                      : "border-[#bccbe0] bg-[#e9eef6] text-[#1b2e4d]"
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
            <div className="flex items-center gap-2 text-sm text-[var(--ink-4)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载状态……
            </div>
          )}
        </CardContent>
      </Card>
      </>
      ) : null}

      <Card className="order-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {copy("Recent imports", "最近导入")}
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
            <p className="text-sm text-[var(--ink-4)]">{copy("Choose a library to view import history.", "选择文献库后查看导入历史。")}</p>
          ) : importsLoading && importHistory.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-[var(--ink-4)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy("Loading import history...", "正在加载导入历史……")}
            </div>
          ) : importHistory.length > 0 ? (
            <div className="space-y-3">
              {importHistory.map((batch) => (
                <div key={batch.id} className="rounded-[var(--r)] border border-[var(--line-soft)] bg-[var(--paper)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">
                        {batch.source_label || batch.source_type}
                      </p>
                      <p className="text-xs text-[var(--ink-4)]">
                        {new Date(batch.created_at).toLocaleString(isZh ? "zh-CN" : "en-US")} · {batch.source_type}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">
                        {copy(`${batch.total_files} files`, `${batch.total_files} 个文件`)}
                      </Badge>
                      <Badge className="bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]">
                        {copy(`${batch.imported_files} imported`, `${batch.imported_files} 已导入`)}
                      </Badge>
                      <Badge className="bg-[var(--paper-2)] text-[var(--ink-3)] border-[var(--line-soft)]">
                        {copy(`${batch.skipped_files} skipped`, `${batch.skipped_files} 已跳过`)}
                      </Badge>
                      <Badge className="bg-[#f4dfd5] text-[#8a3318] border-[#da9a80]">
                        {copy(`${batch.failed_files} failed`, `${batch.failed_files} 失败`)}
                      </Badge>
                    </div>
                  </div>
                  {batch.files.length > 0 && (
                    <div className="mt-3 space-y-1.5 rounded-[var(--r)] bg-[var(--paper-2)] p-3">
                      {batch.files.slice(0, 6).map((file) => (
                        <div key={file.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-[var(--ink)]">{file.filename}</span>
                          <span className="shrink-0 text-[var(--ink-4)]">{file.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-4)]">
              {copy("This library has no import history yet.", "这个文献库还没有导入历史。")}
            </p>
          )}
        </CardContent>
      </Card>

      {showAdvancedTools ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            建立 AI 论文关联
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--ink-4)]">
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
              className={`rounded-[var(--r)] border p-3 text-sm ${
                relationResult.error || relationResult.linker?.success === false
                  ? "border-[#da9a80] bg-[#f4dfd5] text-[#742b14]"
                  : "border-[#bccbe0] bg-[#e9eef6] text-[#1b2e4d]"
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
      ) : null}

      {/* ================================================================ */}
      {/* Section 2: Discover New Papers */}
      {/* ================================================================ */}
      {showAdvancedTools && appConfig.supportsRemoteDiscovery && (
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
            <div className="flex items-center gap-2 rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] p-3 text-sm text-[#8a3318]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {discoverError}
            </div>
          )}

          {discoveredPapers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--ink-4)]">
                找到 {discoveredPapers.length} 篇新论文
              </p>
              <div className="divide-y rounded-[var(--r)] border">
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
                          <Badge className="bg-[var(--forest-soft)] text-[var(--forest-2)] border-[var(--forest)]">
                            已处理
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-[var(--ink)] truncate">
                        {paper.title || "未命名"}
                      </p>
                      {paper.authors && (
                        <p className="text-xs text-[var(--ink-4)] truncate">
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
              <p className="text-sm text-[var(--ink-5)]">
                点击按钮检查 {appConfig.remoteDiscoveryLabel} 是否有新论文。
              </p>
            )}
        </CardContent>
      </Card>
      )}

      {/* ================================================================ */}
      {/* Section 3: Process by ID */}
      {/* ================================================================ */}
      {showAdvancedTools && appConfig.supportsRemoteDiscovery && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            按论文 ID 处理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-[var(--ink-4)]">
            这个操作会使用当前 AI 阅读设置：
            <span className="font-medium text-[var(--ink)]">{selectedReadingProfile?.label ?? "自动"}</span>。
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
                { key: "reader", label: "AI 读取" },
                { key: "refresh", label: "刷新网站数据库" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <StatusIcon
                    status={processSteps[key] ?? "idle"}
                  />
                  <span
                    className={
                      processSteps[key] === "done"
                        ? "text-[var(--ink)]"
                        : processSteps[key] === "error"
                          ? "text-[#8a3318]"
                          : processSteps[key] === "skipped"
                            ? "text-[var(--ink-5)]"
                          : "text-[var(--ink-4)]"
                    }
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {processError && (
            <div className="flex items-center gap-2 rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] p-3 text-sm text-[#8a3318]">
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
      <Card className="order-1 border-[var(--line-soft)] bg-[var(--paper)]/80 shadow-none">
        <CardHeader className="border-b border-[var(--line-soft)] pb-3">
          <CardTitle className="text-sm font-semibold">
            {copy("Add papers", "上传 PDF")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {/* Drop zone */}
          <div
            className={`flex min-h-[108px] flex-col items-center justify-center rounded-[var(--r)] border border-dashed p-5 transition-colors ${
              isDragging
                ? "border-[var(--forest)] bg-[var(--forest-soft)]"
                : uploadFile
                  ? "border-[var(--forest)]/50 bg-[var(--forest-soft)]"
                  : "border-[var(--line-soft)] hover:border-[var(--ink-5)]"
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
                  if (isPdfFile(file)) {
                    setUploadFile(file);
                    setUploadStatus("idle");
                    setUploadError("");
                    setUploadResult(null);
                  } else {
                    setUploadFile(null);
                    setUploadStatus("idle");
                    setUploadResult(null);
                    setUploadError(copy("Choose a PDF file.", "请选择 PDF 文件。"));
                  }
                }
              }}
            />
            {uploadFile ? (
              <div className="flex items-center gap-2 text-sm text-[var(--forest-2)] dark:text-[var(--forest)]">
                <FileText className="h-5 w-5" />
                <span className="font-medium">{uploadFile.name}</span>
                <span className="text-[var(--ink-4)]">
                  ({(uploadFile.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="mx-auto h-7 w-7 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm text-[var(--ink-4)]">
                  {copy("Drop a PDF here, or click to choose a file", "拖入 PDF，或点击选择文件")}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">{copy("Maximum 50 MB", "最大 50 MB")}</p>
              </div>
            )}
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              placeholder={copy("NBER ID or DOI (for example w35000 or 10.xxxx/xxxx)", "NBER ID 或 DOI（如 w35000 或 10.xxxx/xxxx）")}
              value={importIdentifier}
              onChange={(e) => setImportIdentifier(e.target.value)}
              className="h-10 min-w-0 rounded-[var(--r)] font-mono text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleImportLiterature();
              }}
            />
            <Button
              type="button"
              onClick={handleImportLiterature}
              disabled={
                doiLoading ||
                uploadStatus === "uploading" ||
                !selectedLibraryId ||
                (!uploadFile && !importIdentifier.trim())
              }
              className="gap-2"
            >
              {doiLoading || uploadStatus === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {copy("Import paper", "导入文献")}
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
              {copy("Import folder", "导入文件夹")}
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
          <p className="text-xs text-[var(--ink-4)]">
            {copy("Import a PDF, NBER ID, or DOI here. The app detects and registers it, then adds it to the queue. Confirm the reading dimensions and click Start reading.", "流程：先在这里导入 PDF、NBER ID 或 DOI；系统会自动识别并登记。随后在下方确认读取维度，点击“开始读取”处理队列。")}
          </p>
          {doiMessage ? (
            <div className="rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] p-3 text-sm text-[#1b2e4d]">
              <p>{doiMessage}</p>
              {recentImportedPapers.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {recentImportedPapers.map((paper) => (
                    <div
                      key={paper.paperId}
                      className="flex flex-wrap items-center gap-2 rounded-[var(--r)] bg-[var(--paper)]/55 px-2 py-1 text-xs"
                    >
                      <span className="font-mono font-medium">{paper.paperId}</span>
                      {paper.note ? <span>{paper.note}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Upload result */}
          {uploadStatus === "done" && uploadResult && (
            <div className="rounded-[var(--r)] border border-[var(--forest)] bg-[var(--forest-soft)] p-3 text-sm text-[var(--forest-2)]">
              <p className="font-medium">{copy("Upload complete", "上传成功")}</p>
              <p className="mt-1 text-xs">
                {copy("Paper ID:", "论文 ID：")} <span className="font-mono">{uploadResult.paper_id ?? ""}</span>
                {" "}&middot; {copy("Status:", "状态：")} {uploadResult.status ?? ""}
              </p>
              {uploadResult.reading_profile ? (
                <p className="mt-1 text-xs">
                  {copy("Reading profile:", "阅读方案：")} <span className="font-medium">{uploadResult.reading_profile}</span>
                </p>
              ) : null}
              {uploadResult.text_cache ? (
                <p className="mt-1 text-xs">
                  {copy("Text cache:", "文本缓存：")}
                  {uploadResult.text_cache.status === "ok" ? (
                    <>
                      {copy("Preview", "预览")} {uploadResult.text_cache.scout_chars?.toLocaleString() ?? 0} {copy("characters", "字")}
                      {uploadResult.text_cache.full_chars != null
                        ? copy(
                            ` · full ${uploadResult.text_cache.full_chars.toLocaleString()} characters`,
                            ` · full ${uploadResult.text_cache.full_chars.toLocaleString()} 字`
                          )
                        : ""}
                    </>
                  ) : (
                    <span className="text-[#7a5a18]">
                      {copy("Generation failed:", "生成失败：")} {uploadResult.text_cache.error ?? "unknown"}
                    </span>
                  )}
                </p>
              ) : null}
            </div>
          )}
          {uploadError && (
            <div className="flex items-center gap-2 rounded-[var(--r)] border border-[#da9a80] bg-[#f4dfd5] p-3 text-sm text-[#8a3318]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}
          {batchResult && (
            <div className="rounded-[var(--r)] border border-[#bccbe0] bg-[#e9eef6] p-3 text-sm text-[#1b2e4d]">
              <p className="font-medium">
                {copy(
                  `Batch import complete: ${batchResult.imported_files} imported, ${batchResult.skipped_files} skipped, ${batchResult.failed_files} failed`,
                  `批量导入完成：${batchResult.imported_files} 个已导入，${batchResult.skipped_files} 个已跳过，${batchResult.failed_files} 个失败`
                )}
              </p>
              <div className="mt-2 max-h-40 overflow-auto space-y-1 text-xs">
                {batchResult.results.map((item) => (
                  <div key={`${item.filename}-${item.paper_id ?? ""}`} className="flex items-center justify-between gap-3">
                    <span className="truncate">{item.filename}</span>
                    <span className="shrink-0 font-medium">
                      {item.status ?? copy("Unknown", "未知")}
                    </span>
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
      {showAdvancedTools ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            最近活动
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pipelineStatus?.recent && pipelineStatus.recent.length > 0 ? (
            <div className="divide-y rounded-[var(--r)] border">
              {pipelineStatus.recent.map((paper) => (
                <div
                  key={paper.paper_id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm text-[var(--ink-3)]">
                      {paper.paper_id}
                    </span>
                    <Badge
                      variant="outline"
                      className={statusColor(paper.status)}
                    >
                      {paper.status}
                    </Badge>
                    {paper.reading_profile && (
                      <Badge variant="outline" className="text-xs">
                        {paper.reading_profile}
                      </Badge>
                    )}
                  </div>
                  {paper.updated_at && (
                    <span className="shrink-0 text-xs text-[var(--ink-5)]">
                      {new Date(paper.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-5)]">暂无最近活动。</p>
          )}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}

export default function PipelinePage() {
  return <PipelinePageContent />;
}
