// 中文注释：P3 网关阶段执行器——可插拔执行器，经 HTTP 驱动网关跑一个编排阶段，取代 spawn 冷 CLI。
// 角色取自 phase.role，网关按角色→模型路由。spawn 执行器（local-phase）保留为回退（两扇门）。
// 执行器 CWD 不在安装树内（网关是独立常驻进程），不锁 aios update 的目录替换。

export const GATEWAY_PHASE_EXECUTOR = 'gateway-phase';

// 从阶段 job 提取任务文本（不猜意图：用显式 launchSpec.task / description / title）。
function phaseTaskText(job) {
  return String(job?.launchSpec?.task || job?.description || job?.title || '').trim();
}

export function createGatewayPhaseExecutor({ client, clientId = '' } = {}) {
  if (!client || typeof client.runPhase !== 'function') {
    throw new TypeError('createGatewayPhaseExecutor requires a gateway client with runPhase');
  }
  async function execute({ plan, job, phase } = {}) {
    const role = String(phase?.role || job?.role || 'implementer').trim();
    const taskText = phaseTaskText(job);
    const systemPrompt = `You are the ${role} for this orchestration phase. Complete the task and report results.`;
    const result = await client.runPhase({ role, clientId, systemPrompt, userPrompt: taskText });
    return {
      executor: GATEWAY_PHASE_EXECUTOR,
      role,
      status: result.ok ? 'completed' : 'failed',
      outputText: result.outputText || '',
      modelId: result.modelId || '',
      elapsedMs: result.elapsedMs ?? 0,
      ...(result.error ? { error: result.error } : {}),
    };
  }
  return Object.freeze({ execute });
}