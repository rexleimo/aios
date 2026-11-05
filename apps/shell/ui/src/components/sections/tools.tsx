// 我的 AI 工具：一行一个客户端，人话状态 + 三个真动作。
//
// 这一页吸收了原来的「接入矩阵 / 技能健康 / 团队与工作流 / 集成」四个只读页面。它们不是被删掉，
// 而是降级成这一页的细节：读的人只关心「我的工具现在能不能用、不能用怎么办」。
import { AXIS_LABEL, EVIDENCE_LABEL } from '../../lib/labels';
import { loadMatrixSnapshot } from '../../lib/data/matrix-loader';
import { loadAgents, loadIntegrations, loadSkillHealth, loadWorkflows } from '../../lib/data/capability.mjs';
import { ErrorNote, Freshness, PageHeader, Stat, StatGrid } from '../page-frame';
import { ActionButton } from '../ui/action-button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '../ui/primitives';

export const dynamic = 'force-dynamic';

/** 把四种内部状态翻译成一句话，人只需要知道这四种。 */
const VERDICT: Record<string, { text: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  covered: { text: '能用', tone: 'ok' },
  'compatibility-only': { text: '只能用只读部分', tone: 'neutral' },
  'pending-smoke': { text: '还没验证过', tone: 'warn' },
  'evidence-blocked': { text: '接了但证据不足', tone: 'danger' },
  'not-covered': { text: '没有采集到', tone: 'warn' },
};

export async function ToolsSection() {
  const [{ matrix, cached, ageMs, stale }, skills, integrations, agents, workflows] = await Promise.all([
    loadMatrixSnapshot(),
    loadSkillHealth(),
    loadIntegrations(),
    loadAgents(),
    loadWorkflows(),
  ]);

  const skillCount = skills.ok
    ? Object.keys((skills.data as { skills?: Record<string, unknown> }).skills ?? {}).length
    : 0;
  const integrationCount = integrations.ok
    ? ((integrations.data as { integrations?: unknown[] }).integrations ?? []).length
    : 0;
  const agentCount = agents.ok
    ? ((agents.data as { agents?: unknown[] }).agents ?? []).length
    : 0;
  const readyAgents = agents.ok
    ? ((agents.data as { agents?: Array<{ workflowEnabled?: boolean }> }).agents ?? []).filter((a) => a.workflowEnabled).length
    : 0;
  const recipeCount = workflows.ok
    ? ((workflows.data as { recipes?: unknown[] }).recipes ?? []).length
    : 0;

  return (
    <>
      <PageHeader
        title="我的 AI 工具"
        description="每个客户端接了什么、现在能不能用、缺什么、以及怎么修。点一行里的动作就会真的执行。"
        source="config/host-capabilities.json + aios status --json"
        status={{ label: `${matrix.coverage.evidenceCovered}/${matrix.coverage.declared} 有证据`, tone: 'info' }}
        freshness={<Freshness cached={cached} ageMs={ageMs} stale={stale} />}
      />

      {!skills.ok ? <ErrorNote message={skills.error} /> : null}
      {!agents.ok ? <ErrorNote message={agents.error} /> : null}

      <StatGrid>
        <Stat label="已接入" value={`${matrix.coverage.evidenceCovered}/${matrix.coverage.declared}`} hint="有采集证据的客户端" tone="ok" />
        <Stat label="没采集" value={matrix.coverage.declaredOnly.length} hint="声明了但没有证据" tone={matrix.coverage.declaredOnly.length > 0 ? 'warn' : 'default'} />
        <Stat label="技能" value={skillCount} hint="有使用记录的技能" />
        <Stat label="AI 角色" value={`${readyAgents}/${agentCount}`} hint={`另有 ${recipeCount} 条工作流`} />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>客户端</CardTitle>
          <CardDescription>
            「能用」= 有 smoke/指标证据；「接了但证据不足」= 装上了但没验过；「没有采集到」≠ 好，是不知道。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {matrix.rows.map((row) => {
            const verdict = VERDICT[row.evidence.label] ?? { text: row.evidence.label, tone: 'neutral' as const };
            const declared = row.axes.filter((cell) => cell.declared);
            return (
              <div key={row.clientId} className="rounded-rex-sm border border-rex-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-rex-mono text-[12px] font-medium text-rex-text">{row.clientId}</span>
                  <Badge tone={verdict.tone}>{verdict.text}</Badge>
                  <span className="font-rex-mono text-[10px] text-rex-text-soft">
                    {row.declaredCount}/{row.axisTotal} 项 · {row.level ?? '—'}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <ActionButton actionId="client.setup.preview" client={row.clientId} label="检查一下" variant="ghost" />
                    <ActionButton actionId="client.setup.apply" client={row.clientId} label="装好它" confirm />
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {declared.length === 0 ? (
                    <span className="text-[11px] text-rex-text-soft">还没有声明任何能力</span>
                  ) : (
                    declared.map((cell) => (
                      <span
                        key={cell.axis}
                        className="rounded-full bg-rex-panel-strong px-1.5 py-0.5 text-[10px] text-rex-text-body"
                      >
                        {AXIS_LABEL[cell.axis] ?? cell.axis}
                      </span>
                    ))
                  )}
                </div>
                {row.limits.length > 0 ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-rex-text-muted">限制：{row.limits[0]}</p>
                ) : null}
                <p className="mt-0.5 font-rex-mono text-[10px] text-rex-text-soft">
                  证据：{EVIDENCE_LABEL[row.evidence.label] ?? row.evidence.label}
                  {row.evidenceRef ? ` · ${row.evidenceRef}` : ''}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>扩展与集成</CardTitle>
            <CardDescription>装了什么、要什么环境变量——细节在 aios integration list。</CardDescription>
          </CardHeader>
          <CardContent className="text-[12px] text-rex-text-body">
            {integrationCount === 0 ? (
              <EmptyState title="没有集成" detail="用 aios integration add 添加第一条。" />
            ) : (
              <ul className="space-y-1">
                {((integrations.data as { integrations?: Array<{ id?: string; displayName?: string; env?: Array<{ name?: string; required?: boolean }> }> }).integrations ?? []).map(
                  (item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-rex-mono text-[11px]">{item.displayName ?? item.id}</span>
                      <span className="text-[10px] text-rex-text-soft">
                        {(item.env ?? []).map((env) => `${env.name}${env.required ? '(必需)' : ''}`).join(' · ') || '无需环境变量'}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI 角色与工作流</CardTitle>
            <CardDescription>
              {readyAgents}/{agentCount} 个角色可用（其余缺 smoke 证据），{recipeCount} 条工作流。
              完整清单在 aios agents list / aios workflow list。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-[11px] leading-relaxed text-rex-text-muted">
            角色没验证之前不会被派去干真活——这是证据门在起作用，不是故障。
          </CardContent>
        </Card>
      </div>
    </>
  );
}
