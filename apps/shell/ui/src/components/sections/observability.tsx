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

interface AgentEntry {
  agentId: string;
  role: string;
  roleFamily: string;
  name: string;
  lifecycleState: string;
  workflowEnabled: boolean;
  blockers: string[];
}

interface RecipeStage {
  id: string;
  agentRole: string;
  agentId: string;
  workflowEnabled: boolean;
}

interface RecipeEntry {
  workflowId: string;
  description: string;
  liveReady: boolean;
  blockers: string[];
  stages: RecipeStage[];
}

export async function TeamSection() {
  const [agents, workflows] = await Promise.all([loadAgents(), loadWorkflows()]);
  const agentList = agents.ok ? ((agents.data as { agents?: AgentEntry[] }).agents ?? []) : [];
  const recipes = workflows.ok ? ((workflows.data as { recipes?: RecipeEntry[] }).recipes ?? []) : [];
  const ready = agentList.filter((agent) => agent.workflowEnabled).length;

  return (
    <>
      <PageHeader
        title="团队与工作流"
        description="19 个默认 agent 与 2 条工作流配方都在这里：谁已经能用、谁还缺证据、卡在哪一条。"
        source="aios agents list --json + aios workflow list --json"
        status={{ label: `${ready}/${agentList.length} 可用`, tone: ready > 0 ? 'ok' : 'warn' }}
        freshness={<Freshness cached={agents.cached} ageMs={agents.ageMs} />}
      />

      {!agents.ok ? <ErrorNote message={agents.error} /> : null}
      {!workflows.ok ? <ErrorNote message={workflows.error} /> : null}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>工作流配方</CardTitle>
          <CardDescription>每条配方逐阶段列出它需要的 agent 与是否就绪——「不能跑」必须指得出是哪一段。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recipes.length === 0 ? (
            <EmptyState title="没有配方" detail="aios workflow list 没有返回条目。" />
          ) : (
            recipes.map((recipe) => (
              <div key={recipe.workflowId} className="rounded-rex-sm border border-rex-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-rex-mono text-[12px] font-medium text-rex-text">{recipe.workflowId}</span>
                  <Badge tone={recipe.liveReady ? 'ok' : 'warn'}>{recipe.liveReady ? '可运行' : '被门挡住'}</Badge>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-rex-text-muted">{recipe.description}</p>
                <ul className="mt-2 space-y-1">
                  {recipe.stages.map((stage) => (
                    <li key={stage.id} className="flex items-center gap-2 text-[11px] text-rex-text-body">
                      <span className={stage.workflowEnabled ? 'text-rex-green' : 'text-rex-orange'}>
                        {stage.workflowEnabled ? '●' : '○'}
                      </span>
                      <span className="font-rex-mono">{stage.id}</span>
                      <span className="text-rex-text-soft">→</span>
                      <span className="font-rex-mono">{stage.agentId || stage.agentRole}</span>
                    </li>
                  ))}
                </ul>
                {recipe.blockers.length > 0 ? (
                  <p className="mt-1.5 text-[11px] text-rex-orange">{recipe.blockers[0]}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent 目录</CardTitle>
          <CardDescription>
            「候选」= 有定义但缺 smoke 证据，能看不能用；「已投影」= 已装进客户端且证据齐。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-rex-border text-left text-[11px] tracking-wide text-rex-text-muted uppercase">
                <th className="py-2 pr-3 font-medium">agent</th>
                <th className="py-2 pr-3 font-medium">角色</th>
                <th className="py-2 pr-3 font-medium">系列</th>
                <th className="py-2 pr-3 font-medium">状态</th>
                <th className="py-2 font-medium">卡在哪</th>
              </tr>
            </thead>
            <tbody>
              {agentList.map((agent) => (
                <tr key={agent.agentId} className="border-b border-rex-border last:border-0 align-top">
                  <td className="py-1.5 pr-3 font-rex-mono">{agent.agentId}</td>
                  <td className="py-1.5 pr-3 text-rex-text-muted">{agent.role}</td>
                  <td className="py-1.5 pr-3 text-rex-text-soft">{agent.roleFamily}</td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={agent.workflowEnabled ? 'ok' : 'warn'}>
                      {agent.workflowEnabled ? '可用' : agent.lifecycleState === 'projected' ? '已投影·未验证' : '候选'}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-[11px] text-rex-text-soft">
                    {agent.blockers.length === 0 ? '—' : agent.blockers[0].replace('missing promotion evidence: ', '缺 ').replace(' evidence', '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        title="能力声明"
        description="这是接入矩阵的事实来源：每个客户端「声称自己支持什么能力」写在这里，矩阵只是它的可视化。"
        source="config/host-capabilities.json"
        status={{ label: `${editable.length} 个客户端`, tone: 'info' }}
        freshness={<Freshness cached={matrix.cached} ageMs={matrix.ageMs} stale={matrix.stale} />}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-rex-md border border-rex-border bg-rex-panel px-4 py-3">
          <p className="text-[11px] font-medium tracking-wide text-rex-text-muted uppercase">改这里会怎样</p>
          <p className="mt-1 text-[12px] leading-relaxed text-rex-text-body">
            关掉某个轴，矩阵上那一格就变空；改等级，等级列跟着变。声明是承诺，不是测量——
            证据列仍然来自 <span className="font-rex-mono">aios status</span> 的采集。
          </p>
        </div>
        <div className="rounded-rex-md border border-rex-border bg-rex-panel px-4 py-3">
          <p className="text-[11px] font-medium tracking-wide text-rex-text-muted uppercase">保存的安全垫</p>
          <p className="mt-1 text-[12px] leading-relaxed text-rex-text-body">
            先备份到 <span className="font-rex-mono">.aios/config-backups/</span>，再整文件替换；
            写完用 <span className="font-rex-mono">aios status</span> 复读一次，读不通就自动回滚。
          </p>
        </div>
        <div className="rounded-rex-md border border-rex-border bg-rex-panel px-4 py-3">
          <p className="text-[11px] font-medium tracking-wide text-rex-text-muted uppercase">不该在这里改的</p>
          <p className="mt-1 text-[12px] leading-relaxed text-rex-text-body">
            证据、用量、agent 状态都是采集结果，不是声明。改声明不会让证据变绿。
          </p>
        </div>
      </div>
      <SettingsEditor
        initial={editable}
        axes={[...matrix.matrix.axes]}
        hash={hash}
        configPath="config/host-capabilities.json"
      />
    </>
  );
}
