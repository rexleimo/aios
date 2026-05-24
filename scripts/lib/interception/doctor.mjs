/* 中文注释：Doctor 链路负责修复默认配置，并检查 MCP 代理、能力矩阵和指标出口是否连通。 */
import { getClientHomes } from '../platform/paths.mjs';
import { migrateBrowserMcpConfig } from '../components/browser.mjs';
import { buildCapabilityMatrix, inspectMcpProxyTargets } from './clients/capabilities.mjs';
import { runInterceptionProof } from './proof.mjs';

/* 中文注释：把每个 MCP 配置文件的检查结果折成健康状态，required 目标未代理直接失败。 */
function statusFromTargets(targets = []) {
  const existing = targets.filter((item) => item.exists);
  const required = targets.filter((item) => item.required);
  const unproxiedRequired = required.filter((item) => !item.exists || !item.proxied);
  const unproxiedExisting = existing.filter((item) => item.hasAlias && !item.proxied);
  return {
    total: targets.length,
    existing: existing.length,
    proxied: targets.filter((item) => item.proxied).length,
    unproxied_required: unproxiedRequired.length,
    unproxied_existing: unproxiedExisting.length,
    ok: unproxiedRequired.length === 0 && unproxiedExisting.length === 0,
  };
}

/* 中文注释：doctor 是运维入口：先看配置，必要时修复，再跑 proof 用真实指标证明链路可用。 */
export async function runInterceptionDoctor(options = {}, { rootDir = process.cwd(), projectRoot = rootDir, io = console, env = process.env, clientHomes = null } = {}) {
  const homes = clientHomes || getClientHomes(env);
  const beforeTargets = inspectMcpProxyTargets({ rootDir, clientHomes: homes });
  let migrationResult = null;
  if (options.fix) {
    /* 中文注释：--fix 只负责把 MCP 配置切到 AIOS proxy，不改变上游 browser-use 服务本身。 */
    migrationResult = await migrateBrowserMcpConfig({
      rootDir,
      dryRun: Boolean(options.dryRun),
      clientHomes: homes,
      io: options.json ? { log() {} } : io,
    });
  }
  const afterTargets = inspectMcpProxyTargets({ rootDir, clientHomes: homes });
  /* 中文注释：配置看起来正确不代表链路真的压缩，所以 doctor 必须再跑一次 live proof。 */
  const proof = await runInterceptionProof({ sessionId: options.sessionId || options.session, json: false }, { rootDir: projectRoot || rootDir, io: { log() {} }, clientHomes: homes });
  const mcpProxy = statusFromTargets(afterTargets);
  const result = {
    ok: proof.ok && mcpProxy.ok,
    exitCode: proof.ok && mcpProxy.ok ? 0 : 1,
    rootDir,
    projectRoot,
    fix: Boolean(options.fix),
    dryRun: Boolean(options.dryRun),
    mcp_proxy: mcpProxy,
    migration: migrationResult,
    targets_before: beforeTargets,
    targets_after: afterTargets,
    proof: {
      session_id: proof.session_id,
      shell: proof.shell,
      mcp: proof.mcp,
      metrics: proof.metrics,
    },
    capability_matrix: buildCapabilityMatrix(rootDir),
  };

  /* 中文注释：JSON 模式给 CI/发布门禁读，文本模式给本地 operator 看。 */
  if (options.json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log('AIOS Interception Doctor');
    io.log('------------------------');
    io.log(`MCP proxy: proxied=${mcpProxy.proxied}/${mcpProxy.total} existing=${mcpProxy.existing} unproxied_required=${mcpProxy.unproxied_required} unproxied_existing=${mcpProxy.unproxied_existing}`);
    if (migrationResult) {
      io.log(`Migration: created=${migrationResult.created} updated=${migrationResult.updated} unchanged=${migrationResult.unchanged} errors=${migrationResult.errors} dryRun=${migrationResult.dryRun}`);
    }
    io.log(`Proof: session=${proof.session_id} total_saved=${proof.metrics.total_saved_bytes}/${proof.metrics.total_raw_bytes} ratio=${proof.metrics.saving_ratio}`);
    io.log(result.ok ? '[ok] interception runtime verified' : '[fail] interception runtime has unproxied targets');
  }
  return result;
}
