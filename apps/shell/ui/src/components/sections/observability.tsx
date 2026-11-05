// 观测与扩展的其余页面：技能健康、团队与工作流、集成、设置。
//
// 这些页面共用一个形状：取一份 JSON → 显示摘要与真相 → 没有数据时给空态。
// 没有动作按钮的页面就明确没有；动作在下一步接到 /api/actions 上。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadAgents, loadIntegrations, loadSkillHealth, loadWorkflows } from '../../lib/data/capability.mjs';
import { loadMatrixSnapshot } from '../../lib/data/matrix-loader';
import { parseDocument, toEditable } from '../../lib/data/host-capabilities.mjs';
import { SettingsEditor } from '../settings-editor';
import { ErrorNote, Freshness, PageHeader, Stat, StatGrid } from '../page-frame';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '../ui/primitives';

export const dynamic = 'force-dynamic';

export async function SkillsSection() {
  const result = await loadSkillHealth();
  if (!result.ok) {
    return (
      <>
        <PageHeader title="技能健康" description="技能的安装与失败模式。" source="aios skill health --json" />
        <ErrorNote message={result.error} />
      </>
    );
  }
  const data = result.data as {
    generatedAt?: string;
    windowDays?: number;
    skills?: Record<string, { installs?: number; failures?: number }>;
    failurePatterns?: unknown[];
  };
  const skills = Object.entries(data.skills ?? {});
  const patterns = data.failurePatterns ?? [];

  return (
    <>
      <PageHeader
        title="技能健康"
        description="技能在这台机器上的安装与使用记录。没有任何记录也是事实，不补默认值。"
        source="aios skill health --json"
        status={{ label: `窗口 ${data.windowDays ?? '—'} 天`, tone: 'neutral' }}
        freshness={<Freshness cached={result.cached} ageMs={result.ageMs} />}
      />

      <StatGrid>
        <Stat label="技能条目" value={skills.length} hint="有记录的技能数" />
        <Stat label="失败模式" value={patterns.length} tone={patterns.length > 0 ? 'warn' : 'ok'} hint="被归类过的失败" />
        <Stat label="生成于" value={data.generatedAt ? data.generatedAt.slice(11, 19) : '—'} hint={data.generatedAt?.slice(0, 10) ?? ''} />
        <Stat label="窗口" value={`${data.windowDays ?? 0} 天`} hint="统计范围" />
      </StatGrid>

      {skills.length === 0 ? (
        <EmptyState title="还没有技能使用记录" detail="跑一次技能执行后，这里会出现按技能的安装与失败计数。" />
      ) : (
        <Card>
          <CardContent className="divide-y divide-rex-border pt-3">
            {skills.map(([id, entry]) => (
              <div key={id} className="flex items-center justify-between py-2">
                <span className="font-rex-mono text-[12px] text-rex-text-body">{id}</span>
                <span className="text-[11px] text-rex-text-muted">
                  installs {entry?.installs ?? 0} · failures {entry?.failures ?? 0}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

export async function TeamSection() {
  const [agents, workflows] = await Promise.all([loadAgents(), loadWorkflows()]);
  const agentData = agents.ok
    ? (agents.data as {
        summary?: { totalAgents?: number; byLifecycle?: Record<string, number> };
        strict?: { blocked?: boolean };
      })
    : null;
  const workflowData = workflows.ok
    ? (workflows.data as {
        summary?: { totalRecipes?: number; liveReadyRecipes?: number; blockedRecipes?: number; blockedWorkflowIds?: string[] };
      })
    : null;

  return (
    <>
      <PageHeader
        title="团队与工作流"
        description="默认 agent 目录与工作流配方。这里的「被封」不是故障，是证据门在起作用。"
        source="aios agents list --json + aios workflow list --json"
        status={
          agentData?.strict?.blocked
            ? { label: '严格模式有阻塞', tone: 'warn' }
            : { label: '按证据放行', tone: 'ok' }
        }
        freshness={<Freshness cached={agents.cached} ageMs={agents.ageMs} />}
      />

      {!agents.ok ? <ErrorNote message={agents.error} /> : null}
      {!workflows.ok ? <ErrorNote message={workflows.error} /> : null}

      <StatGrid>
        <Stat label="Agent" value={agentData?.summary?.totalAgents ?? 0} hint="默认目录里的角色" />
        <Stat
          label="已投影"
          value={agentData?.summary?.byLifecycle?.projected ?? 0}
          hint="装到客户端上的"
          tone="ok"
        />
        <Stat
          label="候选未验证"
          value={agentData?.summary?.byLifecycle?.candidate ?? 0}
          hint="需要 smoke 证据"
          tone={(agentData?.summary?.byLifecycle?.candidate ?? 0) > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="工作流可用"
          value={`${workflowData?.summary?.liveReadyRecipes ?? 0}/${workflowData?.summary?.totalRecipes ?? 0}`}
          hint="live-ready / 总数"
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>工作流配方</CardTitle>
          <CardDescription>被封的配方会给出原因；这条通道的意义就是让「不能跑」有名字。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(workflowData?.summary?.blockedWorkflowIds ?? []).length === 0 ? (
            <p className="text-[13px] text-rex-text-muted">没有被封的配方。</p>
          ) : (
            (workflowData?.summary?.blockedWorkflowIds ?? []).map((id) => (
              <div key={id} className="flex items-center justify-between">
                <span className="font-rex-mono text-[12px] text-rex-text-body">{id}</span>
                <Badge tone="warn">gate 未满足</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}

export async function IntegrationsSection() {
  const result = await loadIntegrations();
  if (!result.ok) {
    return (
      <>
        <PageHeader title="集成" description="第三方集成注册表。" source="aios integration list --json" />
        <ErrorNote message={result.error} />
      </>
    );
  }
  const data = result.data as {
    integrations?: Array<{
      id?: string;
      displayName?: string;
      vendor?: string;
      homepage?: string;
      summary?: string;
      env?: Array<{ name?: string; required?: boolean }>;
    }>;
  };
  const integrations = data.integrations ?? [];

  return (
    <>
      <PageHeader
        title="集成"
        description="已注册的第三方集成：每个都钉了 commit 与 sha256，缺环境变量会由 doctor 报出来。"
        source="aios integration list --json"
        status={{ label: `${integrations.length} 条`, tone: 'info' }}
        freshness={<Freshness cached={result.cached} ageMs={result.ageMs} />}
      />

      {integrations.length === 0 ? (
        <EmptyState title="注册表是空的" detail="用 aios integration add 添加第一条集成。" />
      ) : (
        <div className="grid gap-3">
          {integrations.map((item) => (
            <Card key={item.id ?? item.displayName}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {item.displayName ?? item.id}
                  <Badge tone="neutral">{item.vendor ?? 'unknown'}</Badge>
                </CardTitle>
                <CardDescription>{item.summary ?? ''}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                {(item.env ?? []).length === 0 ? (
                  <span className="text-[11px] text-rex-text-soft">不需要环境变量</span>
                ) : (
                  (item.env ?? []).map((env) => (
                    <Badge key={env.name} tone={env.required ? 'warn' : 'neutral'}>
                      {env.name}
                      {env.required ? ' · 必需' : ' · 可选'}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export async function SettingsSection() {
  // 服务器侧读文件：设置页要显示的是 owner 文件本身，不是缓存过的副本。
  const root = process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
  const file = path.join(root, 'config', 'host-capabilities.json');
  const matrix = await loadMatrixSnapshot();
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return (
      <>
        <PageHeader title="设置" description="能力声明的所有者是 config/host-capabilities.json。" source="config/host-capabilities.json" />
        <ErrorNote message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  const hash = createHash('sha256').update(text).digest('hex');
  const editable = toEditable(parseDocument(text));

  return (
    <>
      <PageHeader
        title="设置"
        description="这里是矩阵的事实来源。改完保存会先写备份，再用 aios status 验证整条链还能读；验证失败会自动回滚。"
        source="config/host-capabilities.json"
        status={{ label: `${editable.length} 个客户端`, tone: 'info' }}
        freshness={<Freshness cached={matrix.cached} ageMs={matrix.ageMs} stale={matrix.stale} />}
      />
      <SettingsEditor
        initial={editable}
        axes={[...matrix.matrix.axes]}
        hash={hash}
        configPath="config/host-capabilities.json"
      />
    </>
  );
}
