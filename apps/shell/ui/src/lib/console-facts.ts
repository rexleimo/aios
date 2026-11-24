import { t } from '../i18n/t.mjs';
// 首屏事实的**类型与显示名**——这个文件不做任何 IO，所以它可以同时被服务端组件和
// `'use client'` 组件 import（README 约定 3：服务端组件不从 'use client' 模块取数据；
// 类型是双向安全的，数据不是）。
//
// 显示名（label / monogram）属于表现层，不是能力事实：注册表
// `scripts/lib/foundation/clients/registry.mjs` 拥有「这个客户端支持什么」，这里只拥有
// 「clientId 在界面上怎么念」。查不到的 clientId **原样显示**，不猜一个名字——
// 编一个标签正是路线图第 2 节问题 6 里「产品答不出为什么不行」的那种做法。

export type LandingToken =
  | 'landing-verified'
  | 'landing-unverified'
  | 'landing-error'
  | 'landing-unregistered';

export interface FactLanding {
  scope: string;
  format: string;
  file: string;
  writable: boolean;
  registered: boolean;
  services: number;
  status: string;
}

export interface FactLandingStatus {
  scope: string;
  token: LandingToken | string;
  reason: string;
}

export interface FactClient {
  clientId: string;
  services: number;
  scopes: FactLanding[];
  landingTokens: FactLandingStatus[];
  configFiles: string[];
  unreadable: string[];
  /** 产品声明支持，但本机没有落点——这是一个需要解释的状态，不是错误。 */
  declaredOnly: boolean;
  installed: boolean;
}

export interface FactIssue {
  kind: string;
  clientId: string;
  scope: string;
  server?: string;
  detail: string;
  source: string;
}

export interface FactMemory {
  id: string;
  text: string;
  excerpt: string;
  ts: string;
  validAt: string;
  kind: string;
  space: string;
  scope: string | null;
  agent: string | null;
  claimStatus: string | null;
  checkpoint: boolean;
  sourceRef: string | null;
  provenanceTrust: string | null;
  refs: string[];
  supersededBy: string[];
}

/**
 * 一个本机工作区（旧名「项目」）。它只能来自 `aios workspaces list --json`：
 * 注册表登记项 ∪ 文件系统里确实有记忆仓的工程目录。界面不再从会话 meta 猜项目名。
 */
export interface FactProject {
  /** `workspaceKey(path)` 的 12 位摘要：页面对外交出的唯一柄，路径本身不作为输入。 */
  key: string;
  name: string;
  /** 绝对路径，只用于展示与取数，不是回传参数。 */
  path: string;
  sessions: number;
  memos: number;
  /** 记忆仓里最后一条事件的时间；没有则为 null（不编一个默认值）。 */
  lastActivityAt: string | null;
  /** 注册表自己的 lastSeenAt；与 lastActivityAt 不同源，可以相互证明对方新不新。 */
  registeredLastSeenAt: string | null;
  /** 这一条是怎么进的清单：`registered` / `evidence` / 两者。 */
  origin: string[];
  missing: boolean;
  stale: boolean;
  current: boolean;
}

/** 会话目录体检：跳过必须是一条可显示的事实，不是静默过滤。 */
export interface FactSessionsAudit {
  ok: boolean;
  dir: string;
  dirs: number;
  withMeta: number;
  withoutMeta: string[];
  error?: string;
}

export interface FactSession {
  sessionId: string;
  agent: string;
  project: string;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  events: number;
  checkpoints: number;
  hasSummary: boolean;
}

export interface FactServiceRow {
  id: string;
  name: string;
  clientId: string;
  scope: string;
  file: string;
  format: string;
  writable: boolean;
  ownership: string;
  status: string;
  statusReason: string;
  lastVerifiedAt: string | null;
  fields: string[];
}

/** `aios memory report --json` 的 spaces[] 里界面要用的列（字段名与 CLI payload 一致）。 */
export interface FactMemorySpace {
  space: string;
  spaceKey: string;
  events: number;
  chars: number;
  superseded: number;
  oldestTs: string;
  newestTs: string;
  useful: number;
  candidates: number;
}

/** 常驻记忆窗口：`chars` 超出 `maxChars` 时 CLI 报 `truncated`，这是一个需要告诉用户的真实状态。 */
export interface FactPinnedBudget {
  source: string;
  chars: number;
  maxChars: number;
  truncated: boolean;
}

export interface PluginPanelUi {
  kind: 'html';
  html?: string;
  error?: string;
}

export interface ConsoleFacts {
  kind: 'aios.console-facts.v1';
  rootDir: string;
  generatedAt: string;
  totalMs: number;
  timings: Array<{ item: string; ms: number }>;
  /** 每一项失败采集的原文；界面必须把它显示出来，而不是显示成「什么都没有」。 */
  degraded: Array<{ item: string; error: string }>;
  sources: Array<{ field: string; origin: string }>;
  /** 已启用插件贡献的导航页（声明式 panel）；服务端采集，界面合并进主导航。 */
  pluginViews: Array<{ id: string; href: string; label: string; title: string; source: string; ui?: PluginPanelUi }>;
  /** 加载失败的插件（fail-open 记录），界面可如实展示。 */
  pluginFailures: Array<{ id: string; error: string }>;
  declaredClientCount: number;
  declaredOnlyReason: string | null;
  clients: FactClient[];
  services: { rows: FactServiceRow[]; summary: Record<string, unknown> | null; loaded: boolean; error: string | null };
  issues: FactIssue[];
  projects: FactProject[];
  workspaces: FactProject[];
  workspacesScanRoots: string[];
  sessionsAudit: FactSessionsAudit | null;
  sessions: FactSession[];
  memories: FactMemory[];
  pinned: { ok: boolean; chars: number; entries: string[]; reason?: string };
  memoryTotals: { events: number; spaces: number; superseded: number } | null;
  memorySpaces: FactMemorySpace[];
  memoryPinnedBudget: FactPinnedBudget[] | null;
}

/** clientId → 界面读法。新增客户端不需要改这里也能显示（回退成 clientId 本身）。 */
const CLIENT_LABELS: Record<string, { name: string; monogram: string }> = {
  claude: { name: 'Claude Code', monogram: 'C' },
  codex: { name: 'Codex', monogram: '›_' },
  gemini: { name: 'Gemini CLI', monogram: '✦' },
  opencode: { name: 'OpenCode', monogram: 'OC' },
  hermes: { name: 'Hermes', monogram: 'H' },
  grok: { name: 'Grok', monogram: 'G' },
  workbuddy: { name: 'WorkBuddy', monogram: 'WB' },
  pi: { name: 'Pi', monogram: 'π' },
  zcode: { name: 'ZCode', monogram: 'Z' },
  qoder: { name: 'Qoder', monogram: 'Q' },
  cursor: { name: 'Cursor', monogram: 'Cu' },
};

export function clientLabel(clientId: string): { name: string; monogram: string } {
  return CLIENT_LABELS[clientId] ?? { name: clientId, monogram: clientId.slice(0, 1).toUpperCase() };
}

/**
 * 拦截能力矩阵里的「宿主槽位」，不是可接入/选模型的 AI 客户端。
 * 它们声明在 host-capabilities.json 的 clients 段，被 console-facts 一并收进 facts.clients，
 * 但没有配置落点、没有模型可选，不能接入网关——不应出现在 Agent 客户端列表里。
 * Cursor 是真编辑器客户端，不在此列（它有自己的 logo，可接入）。
 */
export const NON_CLIENT_HOSTS: ReadonlySet<string> = new Set(['aios-harness', 'generic-mcp']);

/** 落点 token → 一句话解释。查不到原因时明说「尚未查明」，不编（路线图 P1-1）。 */
export function landingTokenLabel(token: string): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  switch (token) {
    case 'landing-verified':
      return { label: t("落点已验证"), tone: 'ok' };
    case 'landing-unverified':
      return { label: t("落点未验证"), tone: 'warn' };
    case 'landing-error':
      return { label: t("配置读取失败"), tone: 'danger' };
    case 'landing-unregistered':
      return { label: t("落点未登记"), tone: 'neutral' };
    default:
      return { label: token || t("状态未知"), tone: 'neutral' };
  }
}

export const LANDING_TOKEN_EXPLANATION: Record<string, string> = {
  'landing-verified': t("有证据卡确认这个落点真的读写成功。"),
  'landing-unverified': t("配置读到了，但还没有一份证据卡确认写回去也成立——这不代表它坏了。"),
  'landing-error': t("配置文件读失败，界面上的数字来自能读到的部分。"),
  'landing-unregistered': t("产品声明支持这个客户端，但落点声明表里没有它的位置。"),
};

/**
 * memo 的真实可见性词表。它的唯一所有者是
 * `scripts/lib/memory/memo/storage/base/normalizers.mjs` 的 `normalizeMemoScope`，
 *  closed set：project_shared / agent_private / agent_ephemeral。
 * 这里只拥有「这三个 token 在界面上怎么念」，不拥有第三个值该不该存在。
 */
export const MEMO_SCOPE_LABELS: Record<string, string> = {
  project_shared: t("项目内共享（可被本项目 AI 召回）"),
  agent_private: t("仅本代理私有"),
  agent_ephemeral: t("临时，不进入长期召回"),
};

export function claimStatusLabel(claimStatus: string | null): string {
  if (claimStatus === 'verified') return t("已验证");
  if (claimStatus === null) return t("未标注验证状态");
  return claimStatus;
}
