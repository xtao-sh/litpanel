"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { ArrowRight, FileText, Layers, LayoutGrid, Network, Search } from "lucide-react";

import { useI18n } from "@/lib/i18n/locale-context";
import { buildFieldDetailHref, buildPaperDetailHref } from "@/lib/navigation";
import {
  GET_ATOMS,
  GET_FIELD_OVERVIEW,
  GET_PAPER,
  GET_PAPERS,
  GET_STATS,
  GET_TOP_ATOMS,
  GET_TOP_AUTHORS,
  GET_WHATS_NEW,
  GET_YEAR_DISTRIBUTION,
} from "@/lib/queries";
import type { Atom, AuthorSummary, Paper, Stats } from "@/lib/types";

type FieldSummary = {
  field: string;
  paperCount: number;
  atomCount: number;
  avgScore: number | null;
};

type YearCount = {
  year: number;
  count: number;
};

const hubRows = [
  {
    title: "Paper",
    href: "/library",
    icon: FileText,
    description: "15-dim score, sections, atoms.",
    metric: "312 CARDS",
  },
  {
    title: "Graph",
    href: "/graph",
    icon: Network,
    description: "Force · radial · cluster · timeline.",
    metric: "2,941 EDGES",
  },
  {
    title: "Atlas",
    href: "/explorer",
    icon: LayoutGrid,
    description: "Methods · mechanisms · datasets.",
    metric: "1,184 ATOMS",
  },
  {
    title: "Gaps",
    href: "/research",
    icon: Layers,
    description: "Open questions and threads.",
    metric: "12 ACTIVE",
  },
] as const;

const copy = {
  en: {
    mastRight: "PERSONAL CORPUS · 742 PAPERS",
    delta: "+14 THIS WEEK",
    titleA: "Lit",
    titleB: "Panel",
    subtitle: "A reading room for working papers · read · score · extract · stitch · explore",
    search: "Find a paper, an atom (e.g. shift-share IV), an author, or a theme...",
    addPdf: "+ Add PDF",
    importArxiv: "⊕ Import arXiv",
    leadKicker: "LEAD READ",
    today: "today",
    allPapers: "All papers ->",
    topic: "LOCAL LABOR MARKETS · 2025-Q2",
    leadTitle: "The Long Shadow of Trade Shocks: Local Adjustment over Three Decades",
    links: {
      library: "Open Library",
      graph: "Open Graph",
      atlas: "Open Atlas",
    },
    stats: [
      ["742", "+14", "PAPERS", "187", "AUTHORS"],
      ["312", "+9", "DEEP CARDS", "38", "THEMES"],
      ["1,184", "", "ATOMS", "12", "FRONTIER GAPS"],
      ["2,941", "", "EDGES", "28", "OPEN THREADS"],
    ],
  },
  "zh-CN": {
    mastRight: "个人语料库 · 742 篇论文",
    delta: "本周 +14",
    titleA: "文献",
    titleB: "研读台",
    subtitle: "为工作论文而设的阅读室 · 读取 · 评分 · 提取 · 缝合 · 探索",
    search: "查找论文、知识点（如 shift-share IV）、作者或主题...",
    addPdf: "+ 添加 PDF",
    importArxiv: "⊕ 导入 arXiv",
    leadKicker: "今日主读",
    today: "today",
    allPapers: "全部论文 ->",
    topic: "本地劳动力市场 · 2025-Q2",
    leadTitle: "The Long Shadow of Trade Shocks: Local Adjustment over Three Decades",
    links: {
      library: "打开文献库",
      graph: "打开图谱",
      atlas: "打开图谱集",
    },
    stats: [
      ["742", "+14", "论文", "187", "作者"],
      ["312", "+9", "深读卡", "38", "主题"],
      ["1,184", "", "知识点", "12", "前沿缺口"],
      ["2,941", "", "边", "28", "开放线索"],
    ],
  },
} as const;

const fallbackPaper: Paper = {
  paperId: "paper",
  title: "Paper data unavailable",
  authors: [],
  year: null,
  fields: [],
  jel: [],
  triageDecision: null,
  averageScore: null,
  hasCard: false,
  abstract: null,
  nberUrl: null,
};

function buildSparklinePoints(data: Array<{ year: number; count: number }>) {
  if (data.length === 0) return "2,18 70,18";
  const sorted = data.slice().sort((a, b) => a.year - b.year);
  const minYear = sorted[0]?.year ?? new Date().getFullYear();
  const maxYear = sorted.at(-1)?.year ?? minYear;
  const countsByYear = new Map(sorted.map((item) => [item.year, item.count]));
  const series =
    maxYear > minYear
      ? Array.from({ length: maxYear - minYear + 1 }, (_, index) => ({
          year: minYear + index,
          count: countsByYear.get(minYear + index) ?? 0,
        }))
      : sorted;
  const maxCount = Math.max(...series.map((item) => item.count), 1);
  const minCount = Math.min(...series.map((item) => item.count), 0);
  const spread = Math.max(maxCount - minCount, 1);
  const width = 68;
  const height = 18;
  return series
    .map((item, index) => {
      const x = series.length === 1 ? 36 : 2 + (index / (series.length - 1)) * width;
      const y = 3 + (1 - (item.count - minCount) / spread) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Sparkline({ data }: { data: Array<{ year: number; count: number }> }) {
  return (
    <svg className="lp-spark" viewBox="0 0 72 24" aria-hidden="true">
      <polyline points={buildSparklinePoints(data)} />
    </svg>
  );
}

function formatAuthors(authors: string[] | null | undefined) {
  if (!authors || authors.length === 0) return "Unknown authors";
  return authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
}

function formatPaperMeta(paper: Paper) {
  const authorLabel = formatAuthors(paper.authors);
  const yearLabel = paper.year ? ` · ${paper.year}` : "";
  return `${authorLabel}${yearLabel}`;
}

function formatScore(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(1) : "—";
}

function formatCount(value: number | null | undefined, locale: "en" | "zh-CN") {
  return (value ?? 0).toLocaleString(locale);
}

function paperTags(paper: Paper): Array<[string, string]> {
  const fieldTags = (paper.fields ?? []).slice(0, 3).map((field) => [field, "dataset"] as [string, string]);
  if (fieldTags.length > 0) return fieldTags;
  return [[paper.hasCard ? "Deep-read" : "Imported", paper.hasCard ? "method" : "mechanism"]];
}

function paperDetailHref(paper: Paper) {
  return buildPaperDetailHref({ paperId: paper.paperId });
}

function titleWithEmphasis(title: string | null | undefined): ReactNode {
  const text = title || "Untitled paper";
  const words = text.split(" ");
  if (words.length < 5) return text;
  const start = Math.max(1, Math.floor(words.length * 0.55));
  const end = Math.min(words.length, start + 2);
  return (
    <>
      {words.slice(0, start).join(" ")} <em>{words.slice(start, end).join(" ")}</em>
      {end < words.length ? ` ${words.slice(end).join(" ")}` : ""}
    </>
  );
}

function atomText(atom: Atom) {
  return atom.description || `${atom.title} appears in ${atom.paperCount.toLocaleString()} linked papers.`;
}

function typeTone(type: string | null | undefined) {
  if (type === "dataset") return "dataset";
  if (type === "puzzle") return "puzzle";
  if (type === "mechanism") return "mechanism";
  return "method";
}

function pickAtomForSlot(
  atoms: Atom[],
  preferredTypes: string[],
  usedSlugs: Set<string>,
): Atom | undefined {
  const preferred = atoms.find((atom) => preferredTypes.includes(atom.type) && !usedSlugs.has(atom.slug));
  const fallback = preferred ?? atoms.find((atom) => !usedSlugs.has(atom.slug));
  if (fallback) {
    usedSlugs.add(fallback.slug);
  }
  return fallback;
}

export default function HomePage() {
  const { locale } = useI18n();
  const c = copy[locale];
  const isZh = locale === "zh-CN";
  const { data: statsData } = useQuery<{ stats: Stats }>(GET_STATS);
  const { data: papersData, loading: papersLoading } = useQuery<{ papers: { items: Paper[]; total: number } }>(GET_PAPERS, {
    variables: { filter: { hasCard: true }, sort: "SCORE_DESC", limit: 6 },
  });
  const leadPaperId = papersData?.papers.items[0]?.paperId;
  const { data: leadDetailData } = useQuery<{ paper: Paper | null }>(GET_PAPER, {
    variables: { id: leadPaperId ?? "" },
    skip: !leadPaperId,
  });
  const { data: whatsNewData } = useQuery<{ whatsNew: { latestPapers: Paper[] } }>(GET_WHATS_NEW, {
    variables: { limit: 6 },
  });
  const { data: atomsData } = useQuery<{ atoms: { items: Atom[]; total: number } }>(GET_ATOMS, {
    variables: { limit: 100 },
  });
  const { data: topAtomsData } = useQuery<{ topAtoms: Atom[] }>(GET_TOP_ATOMS, {
    variables: { limit: 8 },
  });
  const { data: authorsData } = useQuery<{ topAuthors: AuthorSummary[] }>(GET_TOP_AUTHORS, {
    variables: { limit: 7 },
  });
  const { data: fieldData } = useQuery<{ fieldOverview: FieldSummary[] }>(GET_FIELD_OVERVIEW);
  const { data: yearData } = useQuery<{ yearDistribution: YearCount[] }>(GET_YEAR_DISTRIBUTION);

  const stats = statsData?.stats;
  const leadPaper =
    leadDetailData?.paper ??
    papersData?.papers.items[0] ??
    {
      ...fallbackPaper,
      title: papersLoading ? "Loading paper..." : fallbackPaper.title,
    };
  const leadPaperHref = leadPaper.paperId === fallbackPaper.paperId ? "/library" : paperDetailHref(leadPaper);
  const latestPapers = whatsNewData?.whatsNew.latestPapers ?? papersData?.papers.items ?? [];
  const alsoAddedPapers = latestPapers.filter((paper) => paper.paperId !== leadPaper.paperId).slice(0, 4);
  const leadAtomCards = useMemo(() => {
    const atoms = leadDetailData?.paper?.atoms ?? atomsData?.atoms.items ?? [];
    const used = new Set<string>();
    const slots = [
      {
        key: "question",
        label: locale === "zh-CN" ? "研究问题" : "Research question",
        types: ["puzzle", "mechanism"],
      },
      {
        key: "method",
        label: locale === "zh-CN" ? "研究方法" : "Research method",
        types: ["method"],
      },
      {
        key: "contribution",
        label: locale === "zh-CN" ? "主要创新贡献" : "Main contribution",
        types: ["dataset", "mechanism", "puzzle"],
      },
    ];

    return slots
      .map((slot) => ({
        key: slot.key,
        label: slot.label,
        atom: pickAtomForSlot(atoms, slot.types, used),
      }))
      .filter((slot): slot is { key: string; label: string; atom: Atom } => Boolean(slot.atom));
  }, [atomsData, leadDetailData, locale]);
  const topAtomRows = useMemo(
    () => {
      const sorted = (atomsData?.atoms.items ?? [])
        .concat(topAtomsData?.topAtoms ?? [])
        .slice()
        .sort((a, b) => (b.paperCount ?? 0) - (a.paperCount ?? 0));
      const deduped = new Map<string, Atom>();
      for (const atom of sorted) {
        if (!deduped.has(atom.slug)) {
          deduped.set(atom.slug, atom);
        }
      }
      return Array.from(deduped.values()).slice(0, 8);
    },
    [atomsData, topAtomsData],
  );
  const authorRows = authorsData?.topAuthors ?? [];
  const maxAuthorCount = Math.max(...authorRows.map((author) => author.paperCount), 1);
  const fieldRows = useMemo(
    () =>
      (fieldData?.fieldOverview ?? [])
        .slice()
        .sort((a, b) => b.paperCount - a.paperCount)
        .slice(0, 8),
    [fieldData],
  );
  const activityBars = useMemo(() => {
    const recentYears = (yearData?.yearDistribution ?? []).slice(-8);
    const max = Math.max(...recentYears.map((item) => item.count), 1);
    return recentYears.map((item) => ({
      year: item.year,
      height: Math.max(10, Math.round((item.count / max) * 100)),
      count: item.count,
    }));
  }, [yearData]);
  const latestYear = activityBars.at(-1)?.year ?? new Date().getFullYear();
  const statsRows = [
    [
      formatCount(stats?.totalPapers, locale),
      "",
      locale === "zh-CN" ? "论文" : "PAPERS",
      formatCount(stats?.totalCards, locale),
      locale === "zh-CN" ? "深读卡" : "DEEP CARDS",
    ],
    [
      formatCount(stats?.totalAtoms, locale),
      "",
      locale === "zh-CN" ? "知识点" : "ATOMS",
      formatCount(stats?.totalIdeas, locale),
      locale === "zh-CN" ? "想法" : "IDEAS",
    ],
    [
      formatCount(stats?.totalMethods, locale),
      "",
      locale === "zh-CN" ? "方法" : "METHODS",
      formatCount(stats?.totalMechanisms, locale),
      locale === "zh-CN" ? "机制" : "MECHANISMS",
    ],
    [
      formatCount(stats?.totalDatasets, locale),
      "",
      locale === "zh-CN" ? "数据集" : "DATASETS",
      formatCount(stats?.totalPuzzles, locale),
      locale === "zh-CN" ? "问题" : "PUZZLES",
    ],
  ] as const;
  const weekRows = latestPapers.slice(0, 6).map((paper) => ({
    day: paper.paperId,
    href: paperDetailHref(paper),
    text: (
      <>
        Added{" "}
        <Link href={paperDetailHref(paper)} className="lp-paper-title-link">
          <em>{paper.title || paper.paperId}</em>
        </Link>
        {paper.year ? ` · ${paper.year}` : ""}.
      </>
    ),
  }));

  return (
    <div className="lp-home">
      {stats && stats.totalPapers === 0 && (
        <section
          aria-label={isZh ? "开始上手" : "getting started"}
          className="mb-6 rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] p-6"
        >
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {isZh ? "欢迎使用 Lit Panel" : "Welcome to Lit Panel"}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-4)]">
            {isZh
              ? "你的文献库还是空的。两步即可开始:"
              : "Your library is empty. Two steps to get started:"}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/setup"
              className="group flex items-start gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--paper-2)] p-4 transition hover:border-[var(--forest)]"
            >
              <span className="text-base font-semibold text-[var(--ink-3)]">1</span>
              <span>
                <span className="flex items-center gap-1 font-medium text-[var(--ink)]">
                  {isZh ? "配置 AI 密钥" : "Add your AI key"}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 block text-xs text-[var(--ink-4)]">
                  {isZh
                    ? "在 Setup 选择服务商并填入 API key。"
                    : "Pick a provider and paste your API key in Setup."}
                </span>
              </span>
            </Link>
            <Link
              href="/pipeline"
              className="group flex items-start gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--paper-2)] p-4 transition hover:border-[var(--forest)]"
            >
              <span className="text-base font-semibold text-[var(--ink-3)]">2</span>
              <span>
                <span className="flex items-center gap-1 font-medium text-[var(--ink)]">
                  {isZh ? "添加第一篇论文" : "Add your first paper"}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 block text-xs text-[var(--ink-4)]">
                  {isZh
                    ? "上传 PDF 或输入 NBER 编号,然后开始 AI 读取。"
                    : "Upload a PDF or enter an NBER id, then run the AI read."}
                </span>
              </span>
            </Link>
          </div>
        </section>
      )}
      <section className="lp-home-hero">
        <div className="lp-home-stats">
          {statsRows.map(([top, delta, label, bottom, bottomLabel]) => (
            <div key={label} className="lp-home-stat">
              <div>
                <span className="lp-home-stat-num">{top}</span>
                {delta ? <span className="lp-home-stat-delta">{delta}</span> : null}
              </div>
              <span className="lp-home-stat-label">{label}</span>
              <span className="lp-home-stat-sub">{bottom}</span>
              <span className="lp-home-stat-label">{bottomLabel}</span>
            </div>
          ))}
        </div>

        <div className="lp-home-search">
          <Search className="h-5 w-5" />
          <span>{c.search}</span>
          <div className="lp-home-search-actions">
            <kbd>⌘ K</kbd>
            <Link href="/pipeline">{c.addPdf}</Link>
            <Link href="/pipeline">{c.importArxiv}</Link>
          </div>
        </div>
      </section>

      <section className="lp-home-lead">
        <div className="lp-home-section-head">
          <h2>
            {c.leadKicker} <span>{c.today}</span>
          </h2>
          <Link href="/library">{c.allPapers}</Link>
        </div>
        <article className="lp-home-paper">
          <div className="lp-home-paper-grid">
            <div>
              <h3>
                <Link href={leadPaperHref} className="lp-paper-title-link">
                  {titleWithEmphasis(leadPaper.title)}
                </Link>
              </h3>
              <p className="lp-home-authors">{formatPaperMeta(leadPaper)}</p>
            </div>
            <div className="lp-home-atoms">
              {leadAtomCards.map(({ key, label, atom }) => (
                <div key={`${key}-${atom.slug}`} className="lp-home-atom">
                  <span>{label}</span>
                  <p>{atomText(atom)}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="lp-home-section lp-added">
        <div className="lp-home-section-head">
          <h2>
            ALSO ADDED <span>· LAST 7 DAYS</span>
          </h2>
        </div>
        <div className="lp-added-list">
          {alsoAddedPapers.map((paper) => (
            <article key={paper.paperId} className="lp-added-row">
              <Link href={paperDetailHref(paper)} className="lp-added-index">
                {paper.paperId}
              </Link>
              <div className="lp-added-main">
                <h3>
                  <Link href={paperDetailHref(paper)} className="lp-paper-title-link">
                    {titleWithEmphasis(paper.title)}
                  </Link>
                </h3>
                <p>{formatPaperMeta(paper)}</p>
                <div className="lp-tag-row">
                  {paperTags(paper).map(([tag, type]) => (
                    <span key={tag} className={`lp-tag lp-tag-${type}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <strong>{formatScore(paper.averageScore)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-home-section lp-glance">
        <div className="lp-home-section-head">
          <h2>CORPUS AT A GLANCE</h2>
          <Link href="/explorer">
            Open Atlas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="lp-glance-card">
          <div className="lp-glance-coverage">
            <div className="lp-card-head">
              <h3>
                COVERAGE <span>· BY FIELD</span>
              </h3>
              <Link href="/explorer">
                {fieldRows.length} themes <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="lp-glance-field-layout">
              <div className="lp-field-grid">
                {fieldRows.map((field) => (
                  <Link key={field.field} href={buildFieldDetailHref({ field: field.field })} className="lp-field-link">
                    <span>{field.field}</span>
                    <strong>{formatCount(field.paperCount, locale)}</strong>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="lp-glance-activity">
            <div className="lp-card-head">
              <h3>
                ACTIVITY <span>· BY YEAR</span>
              </h3>
              <Link href="/library">
                {latestYear} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="lp-bars" aria-hidden="true">
              {activityBars.map((bar, index) => (
                <span
                  key={bar.year}
                  className={index === activityBars.length - 1 ? "is-active" : ""}
                  style={{ height: `${bar.height}%` }}
                  title={`${bar.year}: ${bar.count}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-home-section lp-hubs">
        <div className="lp-home-section-head">
          <h2>HUBS</h2>
        </div>
        <div className="lp-hubs-grid">
          {hubRows.map((hub) => {
            const Icon = hub.icon;
            return (
              <Link key={hub.title} href={hub.href} className="lp-hub-card">
                <div>
                  <Icon className="h-6 w-6" />
                  <h3>{hub.title}</h3>
                </div>
                <p>{hub.description}</p>
                <span>{hub.metric}</span>
                <ArrowRight className="lp-hub-arrow h-5 w-5" />
              </Link>
            );
          })}
        </div>
      </section>

      <div className="lp-rank-panels">
        <section className="lp-home-section">
          <div className="lp-home-section-head">
            <h2>
              TOP ATOMS <span>most-used</span>
            </h2>
            <Link href="/explorer">
              all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="lp-atom-rank">
            {topAtomRows.map((atom) => (
              <div key={atom.slug} className="lp-atom-row">
                <span className={`lp-dot lp-dot-${typeTone(atom.type)}`} />
                <h3>{atom.title}</h3>
                <span className="lp-rank-type">{atom.type}</span>
                <Sparkline data={atom.yearDistribution ?? []} />
                <strong>{formatCount(atom.paperCount, locale)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-home-section">
          <div className="lp-home-section-head">
            <h2>
              TOP AUTHORS <span>in your corpus</span>
            </h2>
            <Link href="/library">
              all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="lp-author-rank">
            {authorRows.map((author, index) => (
              <div key={author.name} className="lp-author-row">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{author.name}</h3>
                <strong>{formatCount(author.paperCount, locale)}</strong>
                <div className="lp-author-bar">
                  <i style={{ width: `${Math.max(8, Math.round((author.paperCount / maxAuthorCount) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="lp-home-section lp-week">
        <div className="lp-home-section-head">
          <h2>THIS WEEK</h2>
          <Link href="/research">
            log <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="lp-week-log">
          {weekRows.map((entry, index) => (
            <div key={`${entry.day}-${index}`} className="lp-week-row">
              <Link href={entry.href}>{entry.day}</Link>
              <p>{entry.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
