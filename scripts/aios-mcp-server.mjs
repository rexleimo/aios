#!/usr/bin/env node
/* 中文注释：AIOS MCP Server 桥接 Hermes Agent。暴露 5 个核心工具让 Hermes 用户直接调用 AIOS 能力。 */
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* 中文注释：5 个核心工具定义，每个都是标准 MCP inputSchema 格式。 */
const TOOLS = [
  {
    name: 'aios_context_pack',
    description: 'Pack session context with token budget strategy (legacy/balanced/aggressive). Recalls relevant events from AIOS ContextDB and compresses them into a compact packet. Use this when you need rich session memory that fits within a token budget, instead of raw session_search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to recall relevant events' },
        token_budget: { type: 'number', description: 'Max tokens for the packed context (default: 2000)' },
        strategy: { type: 'string', enum: ['legacy', 'balanced', 'aggressive'], description: 'Token budget strategy: legacy (tail truncation), balanced (priority sorting), aggressive (only critical signals)' },
        workspace: { type: 'string', description: 'Workspace root path (defaults to CWD)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'aios_doctor_suite',
    description: 'Run AIOS doctor health check suite. Checks MCP configs, Node version, ContextDB status, skill directories, and client connectivity. Returns a structured report with pass/fail status and fix suggestions. Use this when Hermes environment seems broken or after fresh install.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace root path (defaults to CWD)' },
        fix: { type: 'boolean', description: 'Auto-fix detected issues where possible (default: false)' },
      },
    },
  },
  {
    name: 'aios_intercept_compress',
    description: 'Compress large tool output to save context tokens. Takes raw text and applies AIOS interception compression (tight/ultra/precise). Use this when browser screenshots, long shell output, or HTML dumps would overflow the context window.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Raw text to compress' },
        mode: { type: 'string', enum: ['tight', 'ultra', 'precise'], description: 'Compression mode: tight (default, balanced), ultra (maximum compression for harness), precise (safety-critical, minimal compression)' },
        tool_name: { type: 'string', description: 'Name of the tool that produced this output (for metadata)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'aios_skill_validate',
    description: 'Validate an AIOS or Hermes skill directory. Checks SKILL.md frontmatter (name, description, version, author, platforms), content completeness, and referenced file existence. Use this before creating or installing a skill.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_path: { type: 'string', description: 'Absolute path to the skill directory containing SKILL.md' },
      },
      required: ['skill_path'],
    },
  },
  {
    name: 'aios_skill_install',
    description: 'Install an AIOS skill from a GitHub URL. Supports sparse checkout to only download the skill directory. The skill is installed to the Hermes skill directory (~/.hermes/skills/) or a project-local skill root. Use this to add community skills with one command.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'GitHub URL or repo path (e.g. "https://github.com/user/repo/tree/main/skill-sources/my-skill" or "user/repo:skill-sources/my-skill")' },
        target: { type: 'string', description: 'Target install path. Defaults to ~/.hermes/skills/<skill-name>' },
      },
      required: ['source'],
    },
  },
  {
    name: 'aios_orchestrate',
    description: 'Run the local dry-run orchestration lifecycle through AIOS, including active structured-plan execution-context assembly, shadow preflight, and reconciliation. Context source bodies are delivered only to the runtime channel and are not returned by this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task title for orchestration' },
        context_task: { type: 'string', description: 'Active structured plan task id to assemble' },
        context_budget: { type: 'number', description: 'Runtime context delivery budget units (default: 12000)' },
        sessionId: { type: 'string', description: 'Optional ContextDB session id' },
        plan_path: { type: 'string', description: 'Optional plan artifact path for existing readiness preflight' },
        preflight: { type: 'string', enum: ['none', 'auto'], description: 'Existing orchestrate readiness preflight mode (default: none)' },
        workspace: { type: 'string', description: 'Workspace root path (defaults to CWD)' },
      },
    },
  },
  {
    name: 'aios_plan_start',
    description: 'Start an AIOS planning contract for multi-step work. Creates docs/plans/YYYY-MM-DD-<topic>.md and sets .aios/planning/active.json. Prefer this over Hermes-only or host Plan UI for engineering tasks so all AIOS clients share the same plan artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short plan title' },
        objective: { type: 'string', description: 'Full task objective / user request' },
        workspace: { type: 'string', description: 'Workspace root (defaults to CWD)' },
        client: { type: 'string', description: 'Client id e.g. hermes, claude, codex' },
        sessionId: { type: 'string', description: 'Client session id for acknowledgement continuation matching' },
      },
      required: ['title'],
    },
  },
  {
    name: 'aios_plan_task',
    description: 'Ask AIOS to derive a durable, reviewable context-candidate proposal for an existing structured-plan task. Provide workspace-relative targets when the task has none. This tool never changes active-plan targets or contextRequirements: show the returned candidates to a human, then require an explicit human-controlled aios plan task <id> --confirm-context-candidates process step before orchestration can use them; this is not an identity/authentication boundary.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Existing active structured-plan task id' },
        action: { type: 'string', enum: ['propose_context', 'status'], description: 'propose_context derives target and codemap candidates; status reads the current proposal' },
        targets: { type: 'array', items: { type: 'string' }, description: 'Workspace-relative implementation targets the agent proposes for this task; required when the task has no targets' },
        max_candidates: { type: 'number', description: 'Maximum candidates to return (default: 12, max: 50)' },
        workspace: { type: 'string', description: 'Workspace root (defaults to CWD)' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'aios_plan_status',
    description: 'Read the active AIOS plan pointer (.aios/planning/active.json). Use at session start or before implementation to stay aligned with the AIOS planning contract.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace root (defaults to CWD)' },
      },
    },
  },
  {
    name: 'aios_plan_gate',
    description: 'Set AIOS plan status (active|approved|executing|done|blocked). Use when moving from planning to implementation or when verification finishes.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'approved', 'executing', 'done', 'blocked'], description: 'New plan status' },
        note: { type: 'string', description: 'Optional status note' },
        workspace: { type: 'string', description: 'Workspace root (defaults to CWD)' },
      },
      required: ['status'],
    },
  },
  {
    name: 'aios_plan_auto_gate',
    description: 'Evaluate the client-neutral workflow policy for a user turn. Only planned, non-dry-run work persists docs/plans + .aios/planning/active.json; direct and guarded work return a structured decision without creating artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The current user message / objective (empty returns noop)' },
        workspace: { type: 'string', description: 'Workspace root (defaults to CWD)' },
        client: { type: 'string', description: 'Client id e.g. hermes' },
        sessionId: { type: 'string', description: 'Client session id for acknowledgement continuation matching' },
        policyMode: { type: 'string', enum: ['adaptive', 'strict'], description: 'Workflow policy mode; defaults to AIOS_WORKFLOW_POLICY_MODE or adaptive' },
        dryRun: { type: 'boolean', description: 'Evaluate and return a decision without persisting a planned artifact' },
      },
    },
  },
  {
    name: 'aios_capability_evidence',
    description: 'Persist typed Provider evidence for the current rex-harness Capability Activation, advance its Evidence gate, and return the next provider-neutral Command when available.',
    inputSchema: {
      type: 'object',
      properties: {
        activationId: { type: 'string', description: 'Current rex Capability Activation id' },
        commandToken: { type: 'string', description: 'Execution token from the current persisted Provider Command' },
        evidence: {
          type: 'array',
          description: 'Typed evidence items produced by the current Provider stage',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', description: 'Evidence kind required by the current Command' },
              refs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Artifact, command, diff, or log references proving the evidence',
              },
            },
            required: ['kind', 'refs'],
          },
        },
        workspace: { type: 'string', description: 'Workspace root (defaults to CWD)' },
        requirementsDecision: {
          type: 'object',
          description: 'Typed rex.requirements-decision.v1 payload; accepted only with requirements-decision-recorded evidence',
        },
        wayfinderArtifact: {
          type: 'object',
          description: 'Typed rex.wayfinding-artifact.v1 payload; required by the Wayfinder capability',
        },
        planningArtifact: {
          type: 'object',
          description: 'Typed rex.delivery-ticket.v1 payload; required by the Planning capability',
        },
      },
      required: ['activationId', 'commandToken', 'evidence'],
    },
  },
];

/* 中文注释：JSON-RPC 2.0 辅助函数 */
function makeResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/* 中文注释：resolve AIOS root — 查找 aios 安装路径 */
function resolveAiosRoot() {
  /* 从环境变量或脚本自身路径推断 */
  if (process.env.AIOS_ROOT && existsSync(process.env.AIOS_ROOT)) return process.env.AIOS_ROOT;
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^file:\/\//, ''));
  /* scripts/aios-mcp-server.mjs 的上级目录就是 aios root */
  const candidate = path.resolve(scriptDir, '..');
  if (existsSync(path.join(candidate, 'scripts', 'aios.mjs'))) return candidate;
  return process.cwd();
}

/* 中文注释：context_pack handler — 调用 aios context:pack 或直接用 ContextDB CLI */
async function handleContextPack(params) {
  const aiosRoot = resolveAiosRoot();
  const workspace = params.workspace || process.cwd();
  const query = params.query;
  const budget = params.token_budget || 2000;
  const strategy = params.strategy || 'balanced';

  /* 中文注释：优先尝试 aios CLI，否则 fallback 到直接调用 node mcp-server 入口 */
  try {
    const cmd = `node "${path.join(aiosRoot, 'scripts', 'aios.mjs')}" context search --query "${query}" --limit 20 --workspace "${workspace}" --json`;
    const raw = execSync(cmd, { timeout: 30000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const results = JSON.parse(raw);
    /* 中文注释：对搜索结果做 token budget 裁剪 */
    const packed = applyTokenBudget(results, budget, strategy);
    return { content: [{ type: 'text', text: JSON.stringify(packed, null, 2) }] };
  } catch (err) {
    /* 中文注释：CLI 失败时提供 fallback 提示 */
    return { content: [{ type: 'text', text: `ContextDB search failed: ${err.message}\nMake sure AIOS is installed and ContextDB is initialized.\nRun: node scripts/aios.mjs doctor suite` }] };
  }
}

/* 中文注释：token budget 裁剪 — 简化版（完整版在 ContextDB core.ts 的 selectEventsWithTokenBudget） */
function applyTokenBudget(results, budget, strategy) {
  const events = Array.isArray(results) ? results : (results.events || []);
  const estimatedTokens = (text) => Math.ceil((text || '').length / 4);

  if (strategy === 'aggressive') {
    /* 只保留关键信号：错误、checkpoint、verification */
    const critical = events.filter(e =>
      e.kind === 'error' || e.kind === 'checkpoint' || e.kind === 'verification' ||
      (e.text && e.text.includes('FAIL')) || (e.text && e.text.includes('ERROR'))
    );
    let total = 0;
    const kept = [];
    for (const e of critical) {
      const t = estimatedTokens(e.text || e.summary || '');
      if (total + t > budget) break;
      kept.push({ seq: e.seq, ts: e.ts, kind: e.kind, text: (e.text || e.summary || '').slice(0, 500) });
      total += t;
    }
    return { strategy, budget, used_tokens: total, events: kept };
  }

  if (strategy === 'legacy') {
    /* 尾部截断：保留最后 N 条 */
    let total = 0;
    const kept = [];
    const reversed = [...events].reverse();
    for (const e of reversed) {
      const t = estimatedTokens(e.text || e.summary || '');
      if (total + t > budget) break;
      kept.unshift({ seq: e.seq, ts: e.ts, kind: e.kind, text: (e.text || e.summary || '').slice(0, 500) });
      total += t;
    }
    return { strategy, budget, used_tokens: total, events: kept };
  }

  /* balanced: 按优先级排序（error > checkpoint > tool > user > assistant > system） */
  const priorityMap = { error: 0, checkpoint: 1, verification: 2, tool: 3, user: 4, assistant: 5, system: 6 };
  const sorted = [...events].sort((a, b) =>
    (priorityMap[a.kind] || 99) - (priorityMap[b.kind] || 99)
  );
  let total = 0;
  const kept = [];
  for (const e of sorted) {
    const t = estimatedTokens(e.text || e.summary || '');
    if (total + t > budget) break;
    kept.push({ seq: e.seq, ts: e.ts, kind: e.kind, text: (e.text || e.summary || '').slice(0, 500) });
    total += t;
  }
  return { strategy, budget, used_tokens: total, events: kept };
}

/* 中文注释：doctor_suite handler — 调用 aios doctor suite */
async function handleDoctorSuite(params) {
  const aiosRoot = resolveAiosRoot();
  const workspace = params.workspace || process.cwd();
  const fix = params.fix || false;

  try {
    const cmd = `node "${path.join(aiosRoot, 'scripts', 'aios.mjs')}" doctor suite${fix ? ' --fix' : ''} --workspace "${workspace}" --json`;
    const raw = execSync(cmd, { timeout: 60000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    /* 中文注释：doctor 可能输出非 JSON（TUI），try JSON parse，否则 raw text */
    try {
      const results = JSON.parse(raw);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch {
      return { content: [{ type: 'text', text: raw }] };
    }
  } catch (err) {
    /* 中文注释：fallback: 基础环境检查（Node 版本 + MCP 配置存在性） */
    const checks = [];
    checks.push({ name: 'node_version', status: process.version ? 'pass' : 'fail', detail: process.version || 'unknown' });
    checks.push({ name: 'aios_root', status: existsSync(path.join(aiosRoot, 'scripts', 'aios.mjs')) ? 'pass' : 'fail', detail: aiosRoot });
    checks.push({ name: 'mcp_proxy', status: existsSync(path.join(aiosRoot, 'scripts', 'aios-mcp-proxy.mjs')) ? 'pass' : 'fail', detail: path.join(aiosRoot, 'scripts', 'aios-mcp-proxy.mjs') });
    const hermesSkillsDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hermes', 'skills');
    checks.push({ name: 'hermes_skills_dir', status: existsSync(hermesSkillsDir) ? 'pass' : 'fail', detail: hermesSkillsDir });

    return { content: [{ type: 'text', text: `Doctor suite (fallback):\n${JSON.stringify(checks, null, 2)}\n\nFull doctor failed: ${err.message}` }] };
  }
}

/* 中文注释：intercept_compress handler — 纯文本压缩，不需要外部调用 */
async function handleInterceptCompress(params) {
  const text = params.text || '';
  const mode = params.mode || 'tight';
  const toolName = params.tool_name || 'unknown';

  if (!text) return { content: [{ type: 'text', text: 'No text provided for compression.' }] };

  const originalTokens = Math.ceil(text.length / 4);
  let compressed;

  if (mode === 'ultra') {
    /* 中文注释：ultra 模式 — 只保留前 20 行 + 错误行 + 最后 5 行 */
    const lines = text.split('\n');
    const errorLines = lines.filter(l => /error|fail|exception|traceback/i.test(l));
    const head = lines.slice(0, 20);
    const tail = lines.slice(-5);
    compressed = [...head, ...errorLines.slice(0, 10), ...tail].join('\n');
  } else if (mode === 'precise') {
    /* 中文注释：precise 模式 — 最少压缩，只去掉重复行和空白 */
    compressed = text
      .split('\n')
      .filter((line, i, arr) => line.trim() !== arr[i - 1]?.trim())
      .filter(line => line.trim())
      .join('\n');
  } else {
    /* tight 模式 — 保留关键行：命令、路径、错误、最后状态 */
    const lines = text.split('\n');
    const important = lines.filter(l =>
      /^(\s*[\$>])/i.test(l) ||  /* 命令行 */
      /error|fail|warn|exception|traceback/i.test(l) ||  /* 错误行 */
      /^[A-Za-z0-9_./-]+:\d+:/i.test(l) ||  /* 文件路径行 */
      /^(exit|return|status|result)/i.test(l)  /* 结果行 */
    );
    const head = lines.slice(0, 10);
    const tail = lines.slice(-10);
    compressed = [...new Set([...head, ...important.slice(0, 20), ...tail])].join('\n');
  }

  const compressedTokens = Math.ceil(compressed.length / 4);
  const savings = originalTokens > 0 ? Math.round((1 - compressedTokens / originalTokens) * 100) : 0;

  return {
    content: [{
      type: 'text',
      text: compressed,
    }],
    _meta: {
      aios: {
        original_tokens: originalTokens,
        compressed_tokens: compressedTokens,
        savings_percent: savings,
        mode,
        tool_name: toolName,
      },
    },
  };
}

/* 中文注释：skill_validate handler — 校验 SKILL.md frontmatter */
async function handleSkillValidate(params) {
  const skillPath = params.skill_path;
  if (!skillPath) return { content: [{ type: 'text', text: 'Missing skill_path parameter.' }] };

  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    return { content: [{ type: 'text', text: `SKILL.md not found at ${skillMdPath}` }] };
  }

  const content = readFileSync(skillMdPath, 'utf8');
  /* 中文注释：解析 YAML frontmatter（---之间的内容） */
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { content: [{ type: 'text', text: `No YAML frontmatter found in ${skillMdPath}. AIOS skills require frontmatter with name, description, version, author.` }] };
  }

  const fmText = fmMatch[1];
  /* 中文注释：简易 YAML 解析（不用 js-yaml 依赖） */
  const fm = {};
  for (const line of fmText.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+)$/);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }

  const required = ['name', 'description'];
  const recommended = ['version', 'author'];
  const checks = [];

  for (const field of required) {
    checks.push({ field, status: fm[field] ? 'pass' : 'fail', value: fm[field] || null, severity: 'required' });
  }
  for (const field of recommended) {
    checks.push({ field, status: fm[field] ? 'pass' : 'warn', value: fm[field] || null, severity: 'recommended' });
  }

  /* 中文注释：检查内容是否有实际步骤 */
  const hasSteps = content.includes('## Steps') || content.includes('## 步骤') || content.includes('### Step') || content.includes('### 步骤');
  checks.push({ field: 'has_steps', status: hasSteps ? 'pass' : 'warn', value: hasSteps ? 'yes' : 'no', severity: 'recommended' });

  /* 中文注释：检查 references/templates/scripts 目录是否存在 */
  const subDirs = ['references', 'templates', 'scripts'];
  for (const dir of subDirs) {
    const fullPath = path.join(skillPath, dir);
    checks.push({ field: `dir_${dir}`, status: existsSync(fullPath) ? 'pass' : 'skip', value: fullPath, severity: 'optional' });
  }

  const hasFail = checks.some(c => c.status === 'fail');
  const overall = hasFail ? 'FAIL' : (checks.some(c => c.status === 'warn') ? 'PASS_WITH_WARNINGS' : 'PASS');

  return { content: [{ type: 'text', text: JSON.stringify({ overall, skill_path: skillPath, checks }, null, 2) }] };
}

/* 中文注释：skill_install handler — 从 GitHub sparse checkout 安装 skill */
async function handleSkillInstall(params) {
  const source = params.source;
  const aiosRoot = resolveAiosRoot();
  const hermesHome = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hermes');
  const defaultTarget = path.join(hermesHome, 'skills');

  if (!source) return { content: [{ type: 'text', text: 'Missing source parameter. Provide a GitHub URL or "user/repo:path" format.' }] };

  /* 中文注释：解析 GitHub URL */
  let repoUrl, skillPathInRepo;
  const urlMatch = source.match(/github\.com\/([^/]+\/[^/]+)(?:\/tree\/[^/]+\/(.+))?/);
  const shorthandMatch = source.match(/^([^/]+\/[^/]+):(.+)$/);

  if (urlMatch) {
    repoUrl = `https://github.com/${urlMatch[1]}`;
    skillPathInRepo = urlMatch[2] || '';
  } else if (shorthandMatch) {
    repoUrl = `https://github.com/${shorthandMatch[1]}`;
    skillPathInRepo = shorthandMatch[2];
  } else {
    return { content: [{ type: 'text', text: `Cannot parse source: ${source}. Use "https://github.com/user/repo/tree/branch/path" or "user/repo:path" format.` }] };
  }

  /* 中文注释：用 aios skill installer 或 git sparse checkout */
  try {
    /* 优先尝试 aios 内置 skill installer */
    const installerPath = path.join(aiosRoot, 'skill-sources', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py');
    if (existsSync(installerPath)) {
      const targetDir = params.target || defaultTarget;
      mkdirSync(targetDir, { recursive: true });
      const cmd = `python3 "${installerPath}" --source "${source}" --dest "${targetDir}"`;
      const raw = execSync(cmd, { timeout: 120000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      return { content: [{ type: 'text', text: `Skill installed successfully.\n${raw}\nTarget: ${targetDir}` }] };
    }

    /* fallback: git clone + sparse checkout */
    const tmpDir = path.join(process.cwd(), '.aios-tmp-skill-install');
    mkdirSync(tmpDir, { recursive: true });

    execSync(`git clone --depth 1 --filter=blob:none --sparse "${repoUrl}" "${tmpDir}/repo"`, { timeout: 120000, encoding: 'utf8' });

    if (skillPathInRepo) {
      writeFileSync(path.join(tmpDir, 'repo', '.git', 'info', 'sparse-checkout'), skillPathInRepo + '\n');
      execSync(`git -C "${tmpDir}/repo" sparse-checkout reapply`, { timeout: 60000, encoding: 'utf8' });
    }

    /* 中文注释：找到 SKILL.md 并复制到目标 */
    const skillMdInRepo = skillPathInRepo
      ? path.join(tmpDir, 'repo', skillPathInRepo, 'SKILL.md')
      : findSkillMdInDir(path.join(tmpDir, 'repo'));

    if (!skillMdInRepo || !existsSync(skillMdInRepo)) {
      return { content: [{ type: 'text', text: `No SKILL.md found in cloned repo at ${skillPathInRepo || 'any path'}.` }] };
    }

    const skillDir = path.dirname(skillMdInRepo);
    /* 从 SKILL.md frontmatter 提取 skill name */
    const fmContent = readFileSync(skillMdInRepo, 'utf8');
    const nameMatch = fmContent.match(/^---\n[\s\S]*?name:\s*(.+)\n[\s\S]*?\n---/);
    const skillName = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : path.basename(skillDir);

    const targetDir = params.target || path.join(defaultTarget, skillName);
    mkdirSync(targetDir, { recursive: true });

    /* 中文注释：复制整个 skill 目录 */
    execSync(`cp -r "${skillDir}/"* "${targetDir}/"`, { encoding: 'utf8' });

    /* 清理临时目录 */
    try { execSync(`rm -rf "${tmpDir}"`, { encoding: 'utf8' }); } catch {}

    return { content: [{ type: 'text', text: `Skill "${skillName}" installed to ${targetDir}\nSource: ${source}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Skill install failed: ${err.message}\nMake sure git is available and the source URL is correct.` }] };
  }
}

/* 中文注释：在目录里递归查找第一个 SKILL.md */
function findSkillMdInDir(dir, depth = 3) {
  if (depth <= 0) return null;
  try {
    const entries = execSync(`ls -1 "${dir}"`, { encoding: 'utf8' }).trim().split('\n');
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (entry === 'SKILL.md' && existsSync(full)) return full;
      if (existsSync(full) && !entry.startsWith('.')) {
        const found = findSkillMdInDir(full, depth - 1);
        if (found) return found;
      }
    }
  } catch {}
  return null;
}

/* 中文注释：JSON-RPC 消息处理主函数 */
async function handleMessage(message) {
  if (!message || typeof message.id === 'undefined') return undefined;

  if (message.method === 'initialize') {
    return makeResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'aios-hermes-bridge', version: '1.0.0' },
    });
  }

  if (message.method === 'tools/list') {
    // A4: AIOS_MCP_TOOL_DESC=compact|minimal shrinks tool descriptions for lean context
    const { applyMcpToolDescriptionMode } = await import('./lib/planning/mcp-compact.mjs');
    const tools = applyMcpToolDescriptionMode(TOOLS, process.env.AIOS_MCP_TOOL_DESC || 'full');
    return makeResponse(message.id, { tools });
  }

  if (message.method === 'tools/call') {
    const toolName = message?.params?.name;
    const args = message?.params?.arguments || message?.params || {};

    const handlers = {
      'aios_context_pack': handleContextPack,
      'aios_doctor_suite': handleDoctorSuite,
      'aios_intercept_compress': handleInterceptCompress,
      'aios_skill_validate': handleSkillValidate,
      'aios_skill_install': handleSkillInstall,
      'aios_orchestrate': handleOrchestrate,
      'aios_plan_start': handlePlanStart,
      'aios_plan_task': handlePlanTask,
      'aios_plan_status': handlePlanStatus,
      'aios_plan_gate': handlePlanGate,
      'aios_plan_auto_gate': handlePlanAutoGate,
      'aios_capability_evidence': handleCapabilityEvidence,
    };

    const handler = handlers[toolName];
    if (!handler) return makeError(message.id, -32601, `Unknown tool: ${toolName}`);

    try {
      const result = await handler(args);
      return makeResponse(message.id, result);
    } catch (err) {
      return makeError(message.id, -32000, `Tool execution error: ${err.message}`);
    }
  }

  if (message.method === 'notifications/initialized' || message.method === 'ping') {
    return message.method === 'ping' ? makeResponse(message.id, {}) : undefined;
  }

  return makeResponse(message.id, { capabilities: {}, tools: [] });
}

/* 中文注释：stdio 入口 — 与 shell-mcp-server.mjs 一致的 JSON-RPC over stdin/stdout 模式 */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('aios-mcp-server.mjs')) {
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })}\n`);
      continue;
    }
    const response = await handleMessage(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

/* 中文注释：MCP orchestration 永远限制为本地 dry-run；不允许 tool 参数升级为 live dispatch。 */
async function handleOrchestrate(params = {}) {
  const workspace = params.workspace || process.cwd();
  try {
    const { runOrchestrate } = await import('./lib/lifecycle/orchestrate.mjs');
    const contextTaskId = String(params.context_task || params.contextTaskId || '').trim();
    const contextBudgetUnits = Number(params.context_budget || params.contextBudget || 12_000);
    const runResult = await runOrchestrate({
      taskTitle: String(params.task || params.taskTitle || '').trim() || (contextTaskId ? `Structured task ${contextTaskId}` : 'MCP orchestration'),
      contextTaskId,
      contextBudgetUnits: Number.isFinite(contextBudgetUnits) && contextBudgetUnits > 0 ? contextBudgetUnits : 12_000,
      sessionId: String(params.sessionId || params.session_id || '').trim(),
      planPath: String(params.plan_path || params.planPath || '').trim(),
      preflightMode: params.preflight === 'auto' ? 'auto' : 'none',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    }, {
      rootDir: workspace,
      io: { log() {}, error() {} },
    });
    return { content: [{ type: 'text', text: JSON.stringify(runResult.report, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_orchestrate failed: ${err.message}` }] };
  }
}

/* 中文注释：planning MCP handlers — 委托 lib/planning，保证 Hermes 与 CLI 共用契约 */
async function handlePlanStart(params) {
  const workspace = params.workspace || process.cwd();
  const title = params.title || params.objective;
  if (!title) {
    return { content: [{ type: 'text', text: 'aios_plan_start requires title (or objective)' }] };
  }
  try {
    const { startPlan } = await import('./lib/planning/contract.mjs');
    const state = startPlan({
      rootDir: workspace,
      title,
      objective: params.objective || title,
      client: params.client || 'unknown',
      sessionId: params.sessionId || params.session_id || '',
      source: 'mcp:aios_plan_start',
    });
    return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_plan_start failed: ${err.message}` }] };
  }
}

async function handlePlanTask(params = {}) {
  const workspace = params.workspace || process.cwd();
  const taskId = String(params.task_id || params.taskId || '').trim();
  if (!taskId) {
    return { content: [{ type: 'text', text: 'aios_plan_task requires task_id' }] };
  }
  const action = String(params.action || 'propose_context').trim();
  try {
    const {
      proposeTaskContextCandidates,
      readTaskContextCandidate,
    } = await import('./lib/planning/context-candidates.mjs');
    if (action === 'status') {
      const proposal = await readTaskContextCandidate(workspace, taskId);
      return { content: [{ type: 'text', text: JSON.stringify({ proposal }, null, 2) }] };
    }
    if (action !== 'propose_context') {
      return { content: [{ type: 'text', text: 'aios_plan_task action must be propose_context or status' }] };
    }
    const proposal = await proposeTaskContextCandidates({
      rootDir: workspace,
      taskId,
      targets: Array.isArray(params.targets) ? params.targets : [],
      maxCandidates: params.max_candidates || params.maxCandidates,
      proposedBy: 'mcp:aios_plan_task',
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          proposal,
          confirmationRequired: true,
          confirmationCommand: {
            executable: 'aios',
            args: ['plan', 'task', taskId, '--confirm-context-candidates'],
          },
        }, null, 2),
      }],
    };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_plan_task failed: ${err.message}` }] };
  }
}

async function handlePlanStatus(params) {
  const workspace = params.workspace || process.cwd();
  try {
    const { readActivePlan, formatActivePlanInjection } = await import('./lib/planning/contract.mjs');
    const state = readActivePlan(workspace);
    const injection = formatActivePlanInjection(workspace);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ active: state, injection }, null, 2),
      }],
    };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_plan_status failed: ${err.message}` }] };
  }
}

async function handlePlanGate(params) {
  const workspace = params.workspace || process.cwd();
  if (!params.status) {
    return { content: [{ type: 'text', text: 'aios_plan_gate requires status' }] };
  }
  try {
    const { setPlanStatus } = await import('./lib/planning/contract.mjs');
    const state = setPlanStatus(workspace, params.status, { note: params.note || '' });
    return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_plan_gate failed: ${err.message}` }] };
  }
}

async function handlePlanAutoGate(params) {
  const workspace = params.workspace || process.cwd();
  const message = params.message || params.prompt || params.objective || '';
  try {
    const { runAutoGate } = await import('./lib/planning/auto-gate.mjs');
    const result = runAutoGate({
      rootDir: workspace,
      message,
      client: params.client || 'unknown',
      sessionId: params.sessionId || params.session_id || '',
      policyMode: params.policyMode || params.policy_mode || process.env.AIOS_WORKFLOW_POLICY_MODE,
      explicitIntent: params.explicitIntent || params.intent || null,
      dryRun: Boolean(params.dryRun || params.dry_run),
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_plan_auto_gate failed: ${err.message}` }] };
  }
}

async function handleCapabilityEvidence(params) {
  const workspace = params.workspace || process.cwd();
  try {
    const { recordAiosCapabilityEvidence } = await import('./lib/workflows/rex-capability-runtime.mjs');
    const result = recordAiosCapabilityEvidence({
      rootDir: workspace,
      activationId: params.activationId || params.activation_id,
      commandToken: params.commandToken || params.command_token,
      evidence: params.evidence,
      requirementsDecision: params.requirementsDecision || params.requirements_decision,
      wayfinderArtifact: params.wayfinderArtifact || params.wayfinder_artifact,
      planningArtifact: params.planningArtifact || params.planning_artifact,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `aios_capability_evidence failed: ${err.message}` }] };
  }
}

export {
  handleMessage,
  TOOLS,
  handleContextPack,
  handleDoctorSuite,
  handleInterceptCompress,
  handleSkillValidate,
  handleSkillInstall,
  handleOrchestrate,
  handlePlanStart,
  handlePlanTask,
  handlePlanStatus,
  handlePlanGate,
  handlePlanAutoGate,
  handleCapabilityEvidence,
};
