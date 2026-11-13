// 中文注释：P3 网关客户端——编排器经 HTTP 驱动网关执行一个阶段，取代逐阶段 spawn 冷 CLI（卡死根因）。
// 按角色路由（x-gateway-role），网关负责选模型/翻译/超时。运行时无关（fetch + AbortController）。
// 客户端不持有密钥：鉴权由网关按供应商解析。返回结构化结果，不抛挂起。

export function createGatewayClient({ baseUrl, fetchImpl = fetch, timeoutMs = 120_000 } = {}) {
  const root = String(baseUrl || '').replace(/\/+$/u, '');

  async function runPhase({ role = 'implementer', clientId = '', systemPrompt = '', userPrompt = '', model = 'claude-sonnet-5', maxTokens = 4096 } = {}) {
    const startedAt = Date.now();
    const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] };
    if (systemPrompt) body.system = systemPrompt;
    const headers = { 'content-type': 'application/json', 'x-gateway-role': role };
    if (clientId) headers['x-gateway-client'] = clientId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${root}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      return { ok: false, outputText: '', modelId: model, status: 0, error: controller.signal.aborted ? 'gateway-timeout' : (error?.message || String(error)), elapsedMs: Date.now() - startedAt };
    }
    clearTimeout(timer);
    const json = await res.json().catch(() => ({}));
    const outputText = (json.content || []).filter((b) => b?.type === 'text').map((b) => b.text || '').join('');
    return { ok: res.ok, outputText, modelId: json.model || model, status: res.status, elapsedMs: Date.now() - startedAt, raw: json };
  }

  return Object.freeze({ runPhase });
}