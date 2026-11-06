// Fixture data for the interaction prototype. No real files, projects or memories are read.
export type { ViewId } from '../../lib/console-navigation';
export interface DemoProject {
  id: string;
  name: string;
  path: string;
  status: 'ready' | 'missing';
  private: boolean;
}
export interface DemoMemory {
  id: string;
  project: string;
  title: string;
  excerpt: string;
  paragraphs: string[];
  topic: string;
  date: string;
  state: 'current' | 'updated' | 'candidate';
  source: string | null;
  original: string;
  replaces?: string;
  replacedBy?: string;
}
export interface DemoActivity {
  id: string;
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'neutral';
}
export const PROJECTS: DemoProject[] = [
  { id: 'harness', name: 'harness-cli', path: 'E:\\coding\\harness-cli', status: 'ready', private: false },
  { id: 'north', name: '北辰 · 私人项目', path: 'E:\\projects\\north-star', status: 'ready', private: true },
  { id: 'notes', name: '个人笔记', path: 'E:\\personal\\notes', status: 'ready', private: true },
  { id: 'portfolio', name: '旧版个人站点', path: 'D:\\archive\\portfolio', status: 'missing', private: true },
];
export const MEMORIES: DemoMemory[] = [
  {
    id: 'm-path',
    project: 'harness',
    title: 'Windows 启动入口使用同目录引用',
    excerpt: '入口应从同目录加载 App 组件，避免大小写不敏感的系统误解析。',
    paragraphs: [
      '启动入口与 App 组件放在同一目录时，应使用 ./App 引用组件。',
      '错误的上级目录引用在 Windows 上可能指回入口自身，导致应用启动失败。修改后需要实际运行交互入口验证。',
    ],
    topic: '问题与解决',
    date: '2026-11-06 10:45',
    state: 'current',
    source: '开发会话 · 启动问题排查（示例）',
    original:
      '示例原文：app/index.tsx 与 app/cli.tsx 应从 ./App 命名导入。../App 在大小写不敏感系统上可能解析回 app/ 目录。验证范围包括真实入口启动。',
  },
  {
    id: 'm-scope',
    project: 'harness',
    title: '配置变更必须说明工具和生效范围',
    excerpt: '提交前展示目标客户端、项目与文件；预览阶段不写入。',
    paragraphs: [
      '每次配置操作都要让用户知道修改哪个工具，影响所有项目还是当前项目。',
      '先预览，再执行。成功写入配置与连接测试通过是两个独立结果。',
    ],
    topic: '产品决定',
    date: '2026-11-06 09:20',
    state: 'current',
    source: '产品方向讨论（示例）',
    original: '示例原文：工具与 scope 显式选择，dry-run 不写盘；配置写入与真实握手分开报告。',
  },
  {
    id: 'm-old',
    project: 'harness',
    title: '首页以接入矩阵为中心',
    excerpt: '这项早期决定已由“本机工具管理器”方向更新。',
    paragraphs: ['早期首页优先显示客户端能力矩阵。后续产品方向改为以用户任务和工具管理为主，矩阵放到高级诊断。'],
    topic: '产品决定',
    date: '2026-11-05 15:30',
    state: 'updated',
    source: '早期设计会话（示例）',
    original: '示例原文：首页展示客户端 × 能力接入矩阵。',
    replacedBy: 'm-scope',
  },
  {
    id: 'm-candidate',
    project: 'harness',
    title: '将检查任务放到应用后台运行',
    excerpt: '一条尚待确认的建议，当前不能视作已接受的决定。',
    paragraphs: ['建议在应用后台执行耗时检查，并保留最近一次结果。该建议尚未确认，不自动成为项目约束。'],
    topic: '待讨论',
    date: '2026-11-05 14:10',
    state: 'candidate',
    source: null,
    original: '示例候选：考虑将所有检查迁到后台。尚未确认执行边界。',
  },
  {
    id: 'm-path',
    project: 'north',
    title: '北辰的阅读体验优先于信息密度',
    excerpt: '主要页面使用安静的排版，保留完整段落与足够的阅读空间。',
    paragraphs: [
      '北辰面向需要长时间阅读的个人使用场景。正文保持舒适行宽，重要决定用短标题组织。',
      '标题帮助定位，正文保留细节。技术数据需要时再展开，不让内部标识抢走阅读注意力。',
    ],
    topic: '设计约定',
    date: '2026-11-06 08:50',
    state: 'current',
    source: '项目设计讨论（示例）',
    original: '示例原文：北辰正文重视阅读，技术元数据按需展示。此内容为原型编写，未读取私人文件。',
  },
  {
    id: 'm-private',
    project: 'north',
    title: '本机浏览不改变记忆的共享范围',
    excerpt: '能在 Console 里查看，不代表其他项目的 AI 可以召回。',
    paragraphs: [
      '项目记忆可以在本机管理界面中浏览。该操作本身不会把内容复制到其他项目。',
      '记忆是否供其他 AI 使用，需要单独、明确的共享决定。',
    ],
    topic: '使用偏好',
    date: '2026-11-05 20:15',
    state: 'current',
    source: null,
    original: '示例原文：本机阅读和跨项目召回分离。该记录没有来源引用，不补造来源。',
  },
];
export const TOOLS = [
  {
    id: 'claude',
    name: 'Claude Code',
    monogram: 'C',
    description: 'Anthropic 的编码助手',
    services: 4,
    status: '配置已读取',
    tone: 'ok' as const,
  },
  {
    id: 'codex',
    name: 'Codex',
    monogram: '›_',
    description: 'OpenAI 的编码助手',
    services: 3,
    status: '1 项需要处理',
    tone: 'warn' as const,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    monogram: '✦',
    description: 'Google 的终端助手',
    services: 2,
    status: '配置已读取',
    tone: 'ok' as const,
  },
];
export const INITIAL_ACTIVITY: DemoActivity[] = [
  { id: 'a1', title: '读取 Claude Code 配置', detail: '示例 · 用户级配置可读取，连接尚未测试', tone: 'neutral' },
  { id: 'a2', title: '检查 Codex 的浏览器服务', detail: '示例 · 启动命令不可用，等待处理', tone: 'warn' },
];
export const MEMORY_STATE = {
  current: { label: '未发现更新记录', tone: 'neutral' as const },
  updated: { label: '已被更新', tone: 'warn' as const },
  candidate: { label: '待确认', tone: 'info' as const },
};
