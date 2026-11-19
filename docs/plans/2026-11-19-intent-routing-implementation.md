# 意图分流落地实现方案（任务级粘滞 + 显式回落）

**日期**: 2026-11-19  
**状态**: 实现就绪  
**对应 ADR**: [0011 — 意图分流落地范围](../adr/0011-intent-routing-landing-scope.md)  
**交付目标**: 另一个模型从此文档实现代码

---

## 一、实现目标

用户使用网关，模型始终设为 `aios-auto`，发起任务时：

1. **任务级粘滞**: 一次用户轮 + 其所有工具续轮，固定在同一个意图模型上执行，工具续轮不再重新分类、不切换模型
2. **显式回落**: 任何分类失败、低置信度、意图模型不可达，允许回落到默认路由，但决策记录和路由图必须写明回落阶段和原因，绝不静默回落

---

## 二、当前问题定位

### 2.1 Gap #1: 工具续轮重新分类

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs`  
**行号**: 226, 245-262

```js
const sessionId = c.req.header('x-gateway-session') || c.req.header('x-aios-session');
// ...
const sessionKey = affinity.sessionKey;  // 来自 affinity.mjs，只有显式 header 时才非空
const userText = sessionKey
  ? extractProtocolUserText(parsed, incomingProtocol)
  : latestTurnUserText(parsed, incomingProtocol);  // ← 无 header 时回溯历史重分类
```

**问题**: 
- `affinity.sessionKey` 只在有显式 `x-gateway-session` / `x-aios-session` header 时才非空
- 工具续轮通常不带 header，导致 `sessionKey = null`，每次工具轮都调 `latestTurnUserText` 回溯历史并重新分类

**影响**: 
- 工具续轮被当作新用户任务，重新问分类器，浪费 tokens 和延迟
- 可能切换到不同意图模型（如果历史文本被误判为另一意图）

---

### 2.2 Gap #2: 意图模型不可达时静默回落

**文件**: `scripts/lib/tooling/model-router/gateway/router.mjs`  
**行号**: 72-76, 112-116

```js
const intentTarget = requested ? null : parseTargetRef(context.intentModelId, registry);
const intentModelId = intentTarget?.kind === 'auto' ? null : intentTarget;
const ordered = requested
  ? [requested]
  : intentModelId
    ? [intentModelId, ...chain]  // ← 意图模型排在首位，但 qualify 失败时静默跳到 chain
    : (...);

// ...
const intentRouted = !requested && Boolean(intentModelId) && target.targetRef === parseTargetRef(intentModelId, registry)?.ref;
const finalReason = intentRouted
  ? `intent "${intent.intentId}" classified by ${normalizeId(intent.classifierModel) || 'classifier'} → ${modelId}`
  : target.reason;  // ← intentRouted = false 时，reason 不反映意图失败原因
```

**问题**:
- 意图模型 qualify 失败（credentials 不存在、模型下线、账号额度用尽），`qualify([intentModelId, ...chain])` 返回 `chain` 中的下一个候选
- 决策记录的 `reason` 变成 chain 的 fallback reason，看不出是意图模型不可达导致的回落

**影响**: 
- 用户以为任务在意图模型执行，实际静默切到默认路由，看不出原因

---

### 2.3 Gap #3: 任一意图不可路由导致整个功能关闭

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs`  
**行号**: 94-113

```js
function qualifiedIntentConfig(context) {
  const intentConfig = getIntentRouting(context.registry);
  if (!intentConfig?.enabled) return null;
  const qualified = [];
  for (const item of intentConfig.intents) {
    const target = parseTargetRef(item.modelId, context.registry);
    if (!target || target.kind === 'auto') return null;  // ← 任一意图解析失败 → 整体返回 null
    const { selected } = qualify(context.registry, context.env, target.ref, context.affinity);
    if (!selected) return null;  // ← 任一意图 qualify 失败 → 整体返回 null
    qualified.push({ ...item, route: selected });
  }
  return { ...intentConfig, intents: qualified };
}
```

**问题**: 
- 意图表中任一意图的 `modelId` 解析失败或 qualify 失败，整个 `qualifiedIntentConfig` 返回 `null`
- 调用点 `const intentConfig = qualifiedIntentConfig(context);` 拿到 `null` 后不再走分类逻辑，整个意图分流静默关闭

**影响**: 
- 配置 5 个意图，其中 1 个模型临时下线，导致所有意图都不生效
- 用户看不到任何提示，所有请求都走默认路由

---

### 2.4 Gap #4: 分类器失败/低置信度静默回落

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs`  
**行号**: 245-262

```js
let classified = null;
try {
  classified = await lifetime.run(() => classify(userText, { signal: lifetime.signal }));
} catch {
  lifetime.signal.throwIfAborted();
  // ← 分类失败，classified 保持 null，不记录原因
}
classified = applyConfidenceTier(classified, intentConfig.confidenceThreshold);
// ← 置信度不足，classified 被置为 null，不记录原因
const configuredIntent = intentConfig.intents.find((item) => item.id === classified?.intentId && item.modelId === classified?.modelId);
if (configuredIntent) {
  intent = { intentId, modelId, description, classifierModel, ...(confidence) };
  if (sessionKey) sessionIntents.set(sessionKey, intent);
} else if (sessionKey) {
  sessionIntents.delete(sessionKey);  // ← 失败时清空缓存，下一轮工具续轮仍然拿不到 intent
}
```

**问题**: 
- 分类器网络超时、API 错误、模型返回非预期格式，catch 块吞掉异常，`classified = null`
- `applyConfidenceTier` 返回 `null` 表示置信度不足，但没有记录原因
- 最终 `intent = null`，走默认路由，决策记录看不出分类失败

**影响**: 
- 分类器临时故障，所有新任务静默走默认路由
- 用户不知道是分类器坏了还是意图配置错了

---

## 三、实现方案

### 3.1 总体架构

```
用户请求 (无 x-gateway-session header)
  ↓
affinity.requestAffinity()  
  → 生成 content-derived sessionKey (新增逻辑)
  ↓
proxy 分类逻辑
  → 有 sessionKey 且缓存命中 → 复用意图 (已有逻辑)
  → 有 sessionKey 但缓存未命中 → 分类并缓存 (已有逻辑)
  → 分类失败/低置信度 → 记录 fallback 原因 (新增)
  ↓
router.mjs
  → intentModelId qualify 失败 → 记录 fallback 原因 (新增)
  → 返回 { route, decision: { ..., intentFallback } }
  ↓
决策记录 recordDecision({ ...decision, intentFallback })
  ↓
路由图 UI 渲染 fallback badge
```

---

### 3.2 修改点 1: 内容派生会话键

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/affinity.mjs`  
**当前行号参考**: 函数 `requestAffinity` 约在 60-120 行

#### 当前代码

```js
export function createRoutingAffinity(options = {}) {
  const cache = boundedCache(options);
  const fingerprint = configurationFingerprint(options.registry, options.env);

  return {
    requestAffinity({ protocol, client, role, sessionId, body, fingerprint: reqFingerprint }) {
      const key = (kind, id) =>
        safeId(id) ? JSON.stringify([protocol, client, role, kind, id]) : null;
      const sessionKey = key('session', sessionId);  // ← 只在 sessionId 非空时才有值
      // ...
      return { opaque, sessionKey, select, remember };
    },
  };
}
```

#### 修改后

在 `requestAffinity` 函数中，当 `sessionId` 为空时，派生一个稳定的内容键：

```js
export function createRoutingAffinity(options = {}) {
  const cache = boundedCache(options);
  const fingerprint = configurationFingerprint(options.registry, options.env);

  return {
    requestAffinity({ protocol, client, role, sessionId, body, fingerprint: reqFingerprint }) {
      const key = (kind, id) =>
        safeId(id) ? JSON.stringify([protocol, client, role, kind, id]) : null;

      let sessionKey = key('session', sessionId);

      // 新增：无显式 session header 时，从请求 body 派生内容键
      if (!sessionKey && body) {
        const contentKey = deriveContentSessionKey(body, protocol);
        if (contentKey) {
          sessionKey = key('content', contentKey);
        }
      }

      // ... 其余逻辑不变
      return { opaque, sessionKey, select, remember };
    },
  };
}

/**
 * 从请求 body 派生稳定的会话键，用于工具续轮的意图粘滞
 * 
 * 策略：
 * - OpenAI chat: 最后一条用户消息的内容 hash
 * - Claude: 最后一条用户消息的内容 hash
 * - 其他协议: 返回 null（不支持内容派生）
 * 
 * 限制：
 * - 只从用户消息派生，不包含 assistant/tool 消息
 * - Hash 算法用 Node.js crypto.createHash('sha256')
 * - 取 hash 前 16 字符作为键（8 字节 hex）
 * 
 * @param {object} body - 解析后的请求 body
 * @param {string} protocol - 'claude' | 'openai-chat' | ...
 * @returns {string|null} - 稳定内容键，或 null
 */
function deriveContentSessionKey(body, protocol) {
  try {
    let userMessages = [];

    if (protocol === 'openai-chat' && Array.isArray(body.messages)) {
      userMessages = body.messages
        .filter((m) => m.role === 'user')
        .map((m) => normalizeContent(m.content));
    } else if (protocol === 'claude' && Array.isArray(body.messages)) {
      userMessages = body.messages
        .filter((m) => m.role === 'user')
        .map((m) => normalizeContent(m.content));
    } else {
      return null;
    }

    if (userMessages.length === 0) return null;

    // 只用最后一条用户消息，避免整个历史的 hash（工具续轮会附加历史但最后用户消息不变）
    const lastUserContent = userMessages[userMessages.length - 1];
    if (!lastUserContent) return null;

    const hash = createHash('sha256').update(lastUserContent, 'utf8').digest('hex');
    return hash.slice(0, 16);  // 8 字节 hex
  } catch {
    return null;
  }
}

/**
 * 标准化消息内容为字符串
 * @param {string | Array<{type: string, text?: string, ...}>} content
 * @returns {string}
 */
function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
  }
  return '';
}
```

**导入补充**（文件顶部）：

```js
import { createHash } from 'node:crypto';
```

#### 测试验证

**测试文件**: `scripts/tests/learning/model/gateway/model-router-intent-affinity-content-key.test.mjs` (新建)

```js
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createRoutingAffinity } from '../../../lib/tooling/model-router/gateway/compatibility/affinity.mjs';

describe('affinity content-derived session key', () => {
  const registry = { activeModel: 'claude-sonnet-5', models: {}, providers: {} };
  const env = {};
  const affinity = createRoutingAffinity({ registry, env });

  it('derives stable key from OpenAI chat user message', () => {
    const body1 = { messages: [{ role: 'user', content: 'hello world' }] };
    const body2 = { messages: [{ role: 'user', content: 'hello world' }] };
    const req1 = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body: body1 });
    const req2 = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body: body2 });
    assert.ok(req1.sessionKey);
    assert.strictEqual(req1.sessionKey, req2.sessionKey);
  });

  it('derives different keys for different user messages', () => {
    const body1 = { messages: [{ role: 'user', content: 'task A' }] };
    const body2 = { messages: [{ role: 'user', content: 'task B' }] };
    const req1 = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body: body1 });
    const req2 = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body: body2 });
    assert.notStrictEqual(req1.sessionKey, req2.sessionKey);
  });

  it('uses last user message for key (ignores tool rounds)', () => {
    const bodyInitial = { messages: [{ role: 'user', content: 'run tests' }] };
    const bodyToolRound = {
      messages: [
        { role: 'user', content: 'run tests' },
        { role: 'assistant', content: 'running...' },
        { role: 'user', content: '<tool-result>...</tool-result>' },
      ],
    };
    const req1 = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body: bodyInitial });
    const req2 = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body: bodyToolRound });
    // 两者 sessionKey 应该相同（最后用户消息都是 'run tests'）
    assert.strictEqual(req1.sessionKey, req2.sessionKey);
  });

  it('returns null key when no user messages', () => {
    const body = { messages: [{ role: 'system', content: 'you are a helpful assistant' }] };
    const req = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body });
    assert.strictEqual(req.sessionKey, null);
  });

  it('prefers explicit session header over content key', () => {
    const body = { messages: [{ role: 'user', content: 'hello' }] };
    const reqWithHeader = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: 'explicit-123', body });
    const reqWithoutHeader = affinity.requestAffinity({ protocol: 'openai-chat', client: 'claude', role: 'default', sessionId: null, body });
    assert.ok(reqWithHeader.sessionKey.includes('explicit-123'));
    assert.ok(!reqWithoutHeader.sessionKey.includes('explicit-123'));
  });
});
```

#### 边界条件

- **无用户消息**: 返回 `null`，proxy 回退到 `latestTurnUserText` 逻辑（兼容现状）
- **多用户消息**: 只用最后一条，保证工具续轮（历史+工具结果）派生的键和初始用户轮一致
- **非文本内容**: `normalizeContent` 只取 `type: 'text'` 块，忽略图片、文件等
- **协议不支持**: 只支持 `openai-chat` 和 `claude`，其他协议返回 `null`

---

### 3.3 修改点 2: 记录意图回落原因

#### 3.3.1 数据结构扩展

**决策记录字段新增**（在 `apps/shell/ui/src/lib/config/routing-decisions.mjs` 和 `scripts/lib/tooling/model-router/session/decision-log.mjs` 中体现）:

```ts
interface DecisionEntry {
  recordKey: string;
  at: string;
  clientId: string;
  modelId: string;
  role?: string;
  intent?: string;
  status: 'ok' | 'error';
  error?: string;
  latencyMs?: number;
  usage?: { input: number; output: number };
  
  // 新增字段
  intentFallback?: {
    stage: 'classify' | 'qualify' | 'unavailable';
    reason: string;
    originalIntentId?: string;
    originalModelId?: string;
    fallbackModelId: string;
  };
}
```

**说明**:
- `stage = 'classify'`: 分类器失败（网络超时、API 错误、低置信度）
- `stage = 'qualify'`: 意图模型 credentials 不存在或 qualify 失败
- `stage = 'unavailable'`: 意图模型 qualify 成功但 availability 状态非 `ready`（虽然当前不检查 availability，但预留接口）
- `reason`: 人类可读原因（英文，UI 自行翻译）
- `fallbackModelId`: 实际执行的模型 ID

#### 3.3.2 router.mjs 修改

**文件**: `scripts/lib/tooling/model-router/gateway/router.mjs`  
**行号**: 72-120

**当前代码**:

```js
const intentTarget = requested ? null : parseTargetRef(context.intentModelId, registry);
const intentModelId = intentTarget?.kind === 'auto' ? null : intentTarget;
const ordered = requested
  ? [requested]
  : intentModelId
    ? [intentModelId, ...chain]
    : (...);

const { selected: target, candidates } = qualify(registry, env, ordered, affinity);

const intentRouted = !requested && Boolean(intentModelId) && target.targetRef === parseTargetRef(intentModelId, registry)?.ref;
const finalReason = intentRouted
  ? `intent "${intent.intentId}" classified by ${normalizeId(intent.classifierModel) || 'classifier'} → ${modelId}`
  : target.reason;

return {
  selected: { ...target, reason: finalReason, intentRouted },
  candidates,
  decision: { intentRouted, intent },
};
```

**修改后**:

```js
const intentTarget = requested ? null : parseTargetRef(context.intentModelId, registry);
const intentModelId = intentTarget?.kind === 'auto' ? null : intentTarget;
const ordered = requested
  ? [requested]
  : intentModelId
    ? [intentModelId, ...chain]
    : (...);

const { selected: target, candidates } = qualify(registry, env, ordered, affinity);

const intentRouted = !requested && Boolean(intentModelId) && target.targetRef === parseTargetRef(intentModelId, registry)?.ref;

let intentFallback = null;
if (!requested && intentModelId && !intentRouted) {
  // 意图模型存在但未被选中 → qualify 失败回落
  intentFallback = {
    stage: 'qualify',
    reason: `Intent model ${context.intentModelId} failed qualification: ${target.reason || 'no credentials or unavailable'}`,
    originalIntentId: intent?.intentId,
    originalModelId: context.intentModelId,
    fallbackModelId: target.modelId,
  };
}

const finalReason = intentRouted
  ? `intent "${intent.intentId}" classified by ${normalizeId(intent.classifierModel) || 'classifier'} → ${modelId}`
  : target.reason;

return {
  selected: { ...target, reason: finalReason, intentRouted },
  candidates,
  decision: { intentRouted, intent, intentFallback },
};
```

#### 3.3.3 proxy.mjs 修改

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs`  
**行号**: 245-262

**当前代码**:

```js
let classified = null;
try {
  classified = await lifetime.run(() => classify(userText, { signal: lifetime.signal }));
} catch {
  lifetime.signal.throwIfAborted();
}
classified = applyConfidenceTier(classified, intentConfig.confidenceThreshold);
const configuredIntent = intentConfig.intents.find((item) => item.id === classified?.intentId && item.modelId === classified?.modelId);
if (configuredIntent) {
  intent = { intentId, modelId, description, classifierModel, ...(confidence) };
  if (sessionKey) sessionIntents.set(sessionKey, intent);
} else if (sessionKey) {
  sessionIntents.delete(sessionKey);
}
```

**修改后**:

```js
let classified = null;
let classifyError = null;
let lowConfidence = false;

try {
  classified = await lifetime.run(() => classify(userText, { signal: lifetime.signal }));
} catch (err) {
  lifetime.signal.throwIfAborted();
  classifyError = err;
}

const originalClassified = classified;
classified = applyConfidenceTier(classified, intentConfig.confidenceThreshold);
if (originalClassified && !classified) {
  lowConfidence = true;
}

const configuredIntent = intentConfig.intents.find((item) => item.id === classified?.intentId && item.modelId === classified?.modelId);
if (configuredIntent) {
  intent = { intentId, modelId, description, classifierModel, ...(confidence) };
  if (sessionKey) sessionIntents.set(sessionKey, intent);
} else {
  // 分类失败 → 记录原因，供 router 生成 fallback
  if (classifyError) {
    context.classifyFailure = { stage: 'classify', reason: `Classifier error: ${classifyError.message}` };
  } else if (lowConfidence) {
    context.classifyFailure = {
      stage: 'classify',
      reason: `Low confidence (${originalClassified.confidence.toFixed(2)} < ${intentConfig.confidenceThreshold})`,
      originalIntentId: originalClassified?.intentId,
    };
  } else if (!classified) {
    context.classifyFailure = { stage: 'classify', reason: 'Classifier returned null' };
  }
  
  if (sessionKey) {
    sessionIntents.delete(sessionKey);
  }
}
```

**然后在 router 调用点传递 `context.classifyFailure`**，并在 router 返回的 `decision.intentFallback` 中合并:

在 `proxy.mjs` 调用 router 后（约 line 280）:

```js
const { selected: route, candidates, decision: routerDecision } = selectRoute(routingContext);

// 合并分类失败信息
if (routingContext.classifyFailure && !routerDecision.intentFallback) {
  routerDecision.intentFallback = {
    ...routingContext.classifyFailure,
    fallbackModelId: route.modelId,
  };
}
```

#### 3.3.4 决策记录写入

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs`  
**函数**: `recordDecision` (line 63-68)

**当前代码**:

```js
function recordDecision(entry) {
  decisions.push(entry);
  while (decisions.length > MAX_DECISIONS) decisions.shift();
}
```

**修改**: 不需要修改此函数，只需确保调用时传入 `intentFallback` 字段。

**调用点修改**（约 line 313-355，response 路径）:

```js
record({
  ...route.decision,
  status: 'ok',
  latencyMs,
  usage: { input: upstream.usage?.input || 0, output: upstream.usage?.output || 0 },
  intentFallback: route.decision.intentFallback || null,
});
```

---

### 3.4 修改点 3: 单个意图失败不关闭整体功能

**文件**: `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs`  
**函数**: `qualifiedIntentConfig` (line 94-113)

**当前代码**:

```js
function qualifiedIntentConfig(context) {
  const intentConfig = getIntentRouting(context.registry);
  if (!intentConfig?.enabled) return null;
  const qualified = [];
  for (const item of intentConfig.intents) {
    const target = parseTargetRef(item.modelId, context.registry);
    if (!target || target.kind === 'auto') return null;  // ← 任一失败全部关闭
    const { selected } = qualify(context.registry, context.env, target.ref, context.affinity);
    if (!selected) return null;  // ← 任一失败全部关闭
    qualified.push({ ...item, route: selected });
  }
  return { ...intentConfig, intents: qualified };
}
```

**修改后**:

```js
function qualifiedIntentConfig(context) {
  const intentConfig = getIntentRouting(context.registry);
  if (!intentConfig?.enabled) return null;
  
  const qualified = [];
  const skipped = [];
  
  for (const item of intentConfig.intents) {
    const target = parseTargetRef(item.modelId, context.registry);
    if (!target || target.kind === 'auto') {
      skipped.push({ intentId: item.id, reason: 'target parse failed or is auto' });
      continue;  // ← 跳过此意图，继续处理其他
    }
    const { selected } = qualify(context.registry, context.env, target.ref, context.affinity);
    if (!selected) {
      skipped.push({ intentId: item.id, reason: 'no credentials or qualify failed' });
      continue;  // ← 跳过此意图，继续处理其他
    }
    qualified.push({ ...item, route: selected });
  }
  
  if (qualified.length === 0) {
    // 所有意图都失败 → 返回 null，但记录原因到 context
    context.allIntentsSkipped = skipped;
    return null;
  }
  
  return { ...intentConfig, intents: qualified, skipped };
}
```

**调用点处理** (proxy.mjs line ~180):

```js
const intentConfig = qualifiedIntentConfig(context);
if (!intentConfig && context.allIntentsSkipped) {
  // 可选：记录到日志或决策记录（此阶段还没开始分类，无法写入 decision，但可以 console.warn）
  console.warn('[intent-routing] All intents skipped:', context.allIntentsSkipped);
}
```

---

### 3.5 修改点 4: UI 渲染回落标识

**文件**: `apps/shell/ui/src/components/console/model-routing/routing-graph.tsx`

#### 当前代码（约 line 150-200，entry 渲染部分）:

```tsx
{entry.intent && (
  <Badge variant="secondary" className="text-xs">
    意图 {entry.intent}
  </Badge>
)}
```

#### 修改后:

```tsx
{entry.intent && (
  <Badge variant="secondary" className="text-xs">
    意图 {entry.intent}
  </Badge>
)}
{entry.intentFallback && (
  <Badge variant="destructive" className="text-xs">
    回落 ({entry.intentFallback.stage})
  </Badge>
)}
```

**Tooltip 显示详细原因**（可选增强）:

```tsx
{entry.intentFallback && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className="text-xs cursor-help">
          回落 ({entry.intentFallback.stage})
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <p className="text-sm">{entry.intentFallback.reason}</p>
        {entry.intentFallback.originalIntentId && (
          <p className="text-xs text-muted-foreground mt-1">
            原意图: {entry.intentFallback.originalIntentId} → {entry.intentFallback.originalModelId}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          实际执行: {entry.intentFallback.fallbackModelId}
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

**导入补充**（文件顶部）:

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
```

---

### 3.6 修改点 5: 决策 API 传递新字段

**文件**: `apps/shell/ui/src/app/api/model-routing/decisions/route.ts`

**当前代码** (约 line 20-40):

```ts
const summary = summarizeDecisions(entries);
return NextResponse.json({
  counters: summary.counters,
  edges: summary.edges,
  recent: entries.slice(-20),
});
```

**修改**: 不需要修改（`intentFallback` 字段已在 entry 中，`recent` 会自然传递）。但如果需要统计回落率，可在 `summarizeDecisions` 中新增：

**文件**: `apps/shell/ui/src/lib/config/routing-decisions.mjs`  
**函数**: `summarizeDecisions`

```js
export function summarizeDecisions(entries) {
  const counters = { total: 0, ok: 0, error: 0, autoRouted: 0, intentFallback: 0 };
  const edgeMap = new Map();
  
  for (const entry of entries) {
    counters.total++;
    if (entry.status === 'ok') counters.ok++;
    if (entry.status === 'error') counters.error++;
    if (entry.intent) counters.autoRouted++;
    if (entry.intentFallback) counters.intentFallback++;  // ← 新增
    
    const edgeKey = `${entry.clientId}:${entry.role || 'default'}→${entry.modelId}`;
    edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
  }
  
  return {
    counters,
    edges: Array.from(edgeMap.entries()).map(([key, count]) => ({ key, count })),
  };
}
```

---

## 四、测试计划

### 4.1 单元测试

#### 测试文件: `scripts/tests/learning/model/gateway/model-router-intent-routing-stickiness.test.mjs`

**目标**: 验证工具续轮不重新分类

```js
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createRoutingGatewayApp } from './test-harness.mjs';

describe('intent routing task-level stickiness', () => {
  let classifyCallCount = 0;
  const mockClassify = async (userText) => {
    classifyCallCount++;
    if (userText.includes('run tests')) {
      return { intentId: 'test', modelId: 'qwen3.8-flash', confidence: 0.95 };
    }
    return null;
  };

  const registry = {
    activeModel: 'claude-sonnet-5',
    models: { 'claude-sonnet-5': {}, 'qwen3.8-flash': {} },
    providers: { anthropic: { models: ['claude-sonnet-5'] }, together: { models: ['qwen3.8-flash'] } },
    accounts: { anthropic: { default: { key: 'k1' } }, together: { default: { key: 'k2' } } },
    intentRouting: {
      enabled: true,
      classifierModel: 'qwen3.8-flash',
      confidenceThreshold: 0.7,
      intents: [{ id: 'test', modelId: 'qwen3.8-flash', description: 'Run tests' }],
    },
  };

  it('classifies once for initial turn, reuses for tool continuation', async () => {
    classifyCallCount = 0;
    const { app } = createRoutingGatewayApp({
      registry,
      clientId: 'claude',
      env: { TOGETHER_API_KEY: 'k2', ANTHROPIC_API_KEY: 'k1' },
      classifyIntent: mockClassify,
    });

    // 初始用户轮
    const res1 = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'aios-auto',
        messages: [{ role: 'user', content: 'run tests' }],
      }),
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(classifyCallCount, 1);  // ← 分类一次

    // 工具续轮（同一任务，无 x-gateway-session header）
    const res2 = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'aios-auto',
        messages: [
          { role: 'user', content: 'run tests' },
          { role: 'assistant', content: 'Running...' },
          { role: 'user', content: '<tool-result>...</tool-result>' },
        ],
      }),
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(classifyCallCount, 1);  // ← 没有再次分类

    // 新任务（不同用户消息）
    const res3 = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'aios-auto',
        messages: [{ role: 'user', content: 'write docs' }],
      }),
    });
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(classifyCallCount, 2);  // ← 新任务，重新分类
  });
});
```

#### 测试文件: `scripts/tests/learning/model/gateway/model-router-intent-fallback.test.mjs`

**目标**: 验证回落原因记录

```js
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createRoutingGatewayApp } from './test-harness.mjs';

describe('intent routing fallback logging', () => {
  it('records classify error fallback', async () => {
    const mockClassify = async () => {
      throw new Error('Network timeout');
    };

    const registry = {
      activeModel: 'claude-sonnet-5',
      models: { 'claude-sonnet-5': {} },
      providers: { anthropic: { models: ['claude-sonnet-5'] } },
      accounts: { anthropic: { default: { key: 'k1' } } },
      intentRouting: { enabled: true, classifierModel: 'gpt-4', intents: [{ id: 'test', modelId: 'gpt-4' }] },
    };

    const { app, decisions } = createRoutingGatewayApp({
      registry,
      clientId: 'claude',
      env: { ANTHROPIC_API_KEY: 'k1' },
      classifyIntent: mockClassify,
    });

    await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'aios-auto', messages: [{ role: 'user', content: 'hello' }] }),
    });

    const lastDecision = decisions[decisions.length - 1];
    assert.ok(lastDecision.intentFallback);
    assert.strictEqual(lastDecision.intentFallback.stage, 'classify');
    assert.ok(lastDecision.intentFallback.reason.includes('Network timeout'));
    assert.strictEqual(lastDecision.intentFallback.fallbackModelId, 'claude-sonnet-5');
  });

  it('records qualify failure fallback', async () => {
    const mockClassify = async () => ({ intentId: 'test', modelId: 'gpt-4', confidence: 0.9 });

    const registry = {
      activeModel: 'claude-sonnet-5',
      models: { 'claude-sonnet-5': {}, 'gpt-4': {} },
      providers: { anthropic: { models: ['claude-sonnet-5'] }, openai: { models: ['gpt-4'] } },
      accounts: { anthropic: { default: { key: 'k1' } } },  // ← 无 openai key
      intentRouting: { enabled: true, classifierModel: 'gpt-4', intents: [{ id: 'test', modelId: 'gpt-4' }] },
    };

    const { app, decisions } = createRoutingGatewayApp({
      registry,
      clientId: 'claude',
      env: { ANTHROPIC_API_KEY: 'k1' },
      classifyIntent: mockClassify,
    });

    await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'aios-auto', messages: [{ role: 'user', content: 'test task' }] }),
    });

    const lastDecision = decisions[decisions.length - 1];
    assert.ok(lastDecision.intentFallback);
    assert.strictEqual(lastDecision.intentFallback.stage, 'qualify');
    assert.strictEqual(lastDecision.intentFallback.originalModelId, 'gpt-4');
    assert.strictEqual(lastDecision.intentFallback.fallbackModelId, 'claude-sonnet-5');
  });

  it('records low confidence fallback', async () => {
    const mockClassify = async () => ({ intentId: 'test', modelId: 'gpt-4', confidence: 0.5 });

    const registry = {
      activeModel: 'claude-sonnet-5',
      models: { 'claude-sonnet-5': {}, 'gpt-4': {} },
      providers: { anthropic: { models: ['claude-sonnet-5'] }, openai: { models: ['gpt-4'] } },
      accounts: { anthropic: { default: { key: 'k1' } }, openai: { default: { key: 'k2' } } },
      intentRouting: { enabled: true, classifierModel: 'gpt-4', confidenceThreshold: 0.7, intents: [{ id: 'test', modelId: 'gpt-4' }] },
    };

    const { app, decisions } = createRoutingGatewayApp({
      registry,
      clientId: 'claude',
      env: { ANTHROPIC_API_KEY: 'k1', OPENAI_API_KEY: 'k2' },
      classifyIntent: mockClassify,
    });

    await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'aios-auto', messages: [{ role: 'user', content: 'ambiguous task' }] }),
    });

    const lastDecision = decisions[decisions.length - 1];
    assert.ok(lastDecision.intentFallback);
    assert.strictEqual(lastDecision.intentFallback.stage, 'classify');
    assert.ok(lastDecision.intentFallback.reason.includes('Low confidence'));
    assert.ok(lastDecision.intentFallback.reason.includes('0.50 < 0.7'));
  });
});
```

---

### 4.2 集成测试

**手动验证步骤**:

1. **启动网关**:
   ```bash
   node scripts/aios.mjs shell gateway
   ```

2. **配置意图路由** (`apps/shell/cdk-state.json`):
   ```json
   {
     "intentRouting": {
       "enabled": true,
       "classifierModel": "qwen3.8-flash",
       "confidenceThreshold": 0.7,
       "intents": [
         { "id": "test", "modelId": "qwen3.8-flash", "description": "Run tests" },
         { "id": "docs", "modelId": "claude-sonnet-5", "description": "Write docs" }
       ]
     }
   }
   ```

3. **连接 Claude 客户端** (model 设为 `aios-auto`):
   ```bash
   node scripts/aios.mjs internal model-router connect claude --gateway-url http://localhost:8770 --model aios-auto
   ```

4. **发起测试任务**:
   ```
   > run all unit tests
   ```

5. **验证决策记录** (无需 header):
   ```bash
   curl http://localhost:8770/api/model-routing/decisions | jq '.recent[-1]'
   ```
   
   预期输出:
   ```json
   {
     "clientId": "claude",
     "intent": "test",
     "modelId": "qwen3.8-flash",
     "status": "ok"
   }
   ```

6. **发起工具续轮**（让 Claude 调用工具，等待工具结果返回后继续）:
   
   观察网关日志，确认**没有**出现第二次 `[intent-routing] classifying turn` 日志。

7. **模拟意图模型不可达**:
   
   临时从 `accounts` 中删除 `together` 凭据:
   ```json
   {
     "accounts": {
       "anthropic": { "default": { "key": "sk-ant-..." } }
     }
   }
   ```
   
   重启网关，再次发起测试任务:
   ```
   > run all unit tests
   ```
   
   查看决策记录:
   ```bash
   curl http://localhost:8770/api/model-routing/decisions | jq '.recent[-1]'
   ```
   
   预期输出:
   ```json
   {
     "clientId": "claude",
     "intent": "test",
     "modelId": "claude-sonnet-5",
     "status": "ok",
     "intentFallback": {
       "stage": "qualify",
       "reason": "Intent model qwen3.8-flash failed qualification: no credentials",
       "originalIntentId": "test",
       "originalModelId": "qwen3.8-flash",
       "fallbackModelId": "claude-sonnet-5"
     }
   }
   ```

8. **验证路由图 UI**:
   
   打开 `http://localhost:8770/console`，查看路由图，确认显示红色 "回落 (qualify)" badge，鼠标悬停显示详细原因。

---

## 五、边界条件和已知限制

### 5.1 内容键派生的局限

- **跨会话无法关联**: 不同会话中相同用户消息会生成相同内容键，但这是预期行为（无状态）
- **恶意碰撞**: 攻击者可构造相同 hash 的消息复用缓存，但影响有限（只会复用意图，不影响权限）
- **历史回溯成本**: 当 `sessionKey = null` 时，`latestTurnUserText` 仍会回溯历史，但只在分类失败场景触发（因为有 `sessionKey` 的路径不走 `latestTurnUserText`）

### 5.2 回落语义

- **Fallback 不是错误**: `intentFallback` 存在不意味着请求失败，只表示未按意图执行
- **默认路由质量**: 回落到的默认路由可能比意图模型更强或更弱，取决于 `activeModel` 和 `routingRules` 配置

### 5.3 未来扩展点（本次不实现）

- **分类器缓存**: Magpie 有 10 分钟答案缓存 + 30 秒失败休息，本实现暂不包含
- **可用性探测**: `availability.mjs` 状态未集成到 qualify 逻辑，意图模型可能处于 `degraded` 仍被路由
- **多客户端适配**: `opencode` 和 `hermes` 无 in-place connect editor，需后续补充
- **Per-client intent tables**: 当前意图表全局共享，未来可支持 `clientDefaults.claude.intents` 覆盖

---

## 六、验证清单

在提交 PR 前，确认以下所有项通过:

- [ ] `npm test` 全绿（包含新增单元测试）
- [ ] 手动集成测试步骤 1-8 全部通过
- [ ] 决策记录 API 返回 `intentFallback` 字段（qualify 失败场景）
- [ ] 决策记录 API 返回 `intentFallback` 字段（classify 失败场景）
- [ ] 路由图 UI 显示红色回落 badge（fallback 场景）
- [ ] 路由图 UI 不显示回落 badge（正常 intent 路由场景）
- [ ] 工具续轮不重新分类（无 header 时内容键生效）
- [ ] 显式 session header 优先级高于内容键
- [ ] 单个意图 qualify 失败不关闭整体功能（其他意图仍生效）
- [ ] 所有意图 qualify 失败时，console.warn 记录到网关日志

---

## 七、文件清单

**需要修改的文件**:

1. `scripts/lib/tooling/model-router/gateway/compatibility/affinity.mjs` — 内容键派生
2. `scripts/lib/tooling/model-router/gateway/compatibility/proxy.mjs` — 分类失败记录 + qualifiedIntentConfig 容错
3. `scripts/lib/tooling/model-router/gateway/router.mjs` — qualify 失败记录
4. `apps/shell/ui/src/components/console/model-routing/routing-graph.tsx` — UI 回落 badge
5. `apps/shell/ui/src/lib/config/routing-decisions.mjs` — 决策统计新增 `intentFallback` 计数

**需要新建的文件**:

1. `scripts/tests/learning/model/gateway/model-router-intent-affinity-content-key.test.mjs` — 内容键单元测试
2. `scripts/tests/learning/model/gateway/model-router-intent-routing-stickiness.test.mjs` — 任务级粘滞测试
3. `scripts/tests/learning/model/gateway/model-router-intent-fallback.test.mjs` — 回落记录测试

**需要阅读但不修改的文件**:

- `scripts/lib/tooling/model-router/routing/intent.mjs` — 分类逻辑（已有）
- `scripts/lib/tooling/model-router/routing/targets.mjs` — 目标解析（已有）
- `scripts/lib/tooling/model-router/session/decision-log.mjs` — 决策持久化（已有）
- `apps/shell/ui/src/app/api/model-routing/decisions/route.ts` — 决策 API（已有）

---

## 八、实现顺序建议

1. **affinity.mjs 内容键** + 单元测试 → 最小可验证单元
2. **proxy.mjs 分类失败记录** → 补全 classify 阶段的 fallback 信息
3. **router.mjs qualify 失败记录** → 补全 qualify 阶段的 fallback 信息
4. **proxy.mjs qualifiedIntentConfig 容错** → 修复 gap #3
5. **决策统计 + UI badge** → 可视化验证
6. **集成测试** → 端到端验证

---

## 九、关键设计决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 内容键算法 | SHA-256 前 16 字符 | 平衡碰撞风险和键长度 |
| 内容键范围 | 只用最后一条用户消息 | 工具续轮会附加历史，但最后用户消息不变，保证一致性 |
| Fallback 策略 | 允许但显式记录 | 用户已选择此选项；静默失败不可接受 |
| 单个意图失败处理 | 跳过此意图，继续其他 | 避免一个配置错误拖累整个功能 |
| Session header 优先级 | 显式 header > 内容键 | 尊重显式会话管理，内容键只是兜底 |
| 回落信息存储 | 决策记录中的 `intentFallback` 字段 | 最小侵入，向后兼容（字段可选） |
| UI 回落标识 | 红色 badge + tooltip | 视觉突出 + 详细信息按需展开 |

---

## 十、后续工作（本次不做）

- **Classifier 缓存**: 10 分钟答案缓存 + 30 秒失败休息（Magpie 有，本实现无）
- **In-flight 去重**: 并发请求相同 userText 只调一次分类器（Magpie 有，本实现无）
- **可配置超时**: 分类器 timeout 默认 15s，Magpie 支持 1-60s 可配置
- **userWords 过滤**: 去掉 `<system-reminder>` / `<task-notification>` 等注入块（Magpie 有）
- **turnBefore 上下文**: 给分类器传上一轮对话增强短消息分类（Magpie 有）
- **opencode/hermes connect**: 补充 in-place editor 支持
- **Availability 集成**: 检查意图模型 `availability.state` 是否 `ready` 再路由
- **Claude Code auto mode 兼容**: `safeguards` 字段 + `AUTO_MODE_SERVER` 环境变量处理

---

**交付检查**: 此文档是否让另一个模型能直接开始实现？

- ✅ 文件路径精确到行号
- ✅ 数据结构完整定义（TypeScript interface）
- ✅ 算法伪代码 + 实现代码
- ✅ 测试用例完整（单元 + 集成）
- ✅ 验证命令可执行
- ✅ 边界条件明确列出
- ✅ Out-of-scope 显式声明

准备就绪。
