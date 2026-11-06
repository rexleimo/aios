'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CircleDashed,
  FileText,
  FolderPlus,
  FolderSearch,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { MEMORIES, MEMORY_STATE, type DemoActivity, type DemoMemory, type DemoProject } from './demo-data';
import { Badge, Button, Empty, Field, Heading, Modal, fieldClass } from './console-ui';
import { MemoryDetail } from './flows/memory-detail';
import { ProjectButton } from './flows/project-button';

const memoryKey = (memory: Pick<DemoMemory, 'project' | 'id'>) => `${memory.project}:${memory.id}`;

export function MemoryWorkspace({
  projects,
  onAddProject,
  record,
  target,
}: {
  target: { id: string; nonce: number };
  projects: DemoProject[];
  onAddProject: (project: DemoProject) => void;
  record: (activity: DemoActivity) => void;
}) {
  const [projectId, setProjectId] = useState('harness');
  const [selectedId, setSelectedId] = useState('harness:m-path');
  const [loading, setLoading] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    },
    [],
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [memories, setMemories] = useState(MEMORIES);
  const [useful, setUseful] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [newProject, setNewProject] = useState({ name: '', path: '' });
  const [restored, setRestored] = useState<string[]>([]);
  useEffect(() => {
    if (!target.id) return;
    if (loadTimer.current) clearTimeout(loadTimer.current);
    setProjectId('harness');
    setSelectedId(`harness:${target.id}`);
    setQuery('');
    setFilter('all');
    setLoading(false);
  }, [target.id, target.nonce]);
  const project = projects.find((item) => item.id === projectId);
  const unavailable = project?.status === 'missing' && !restored.includes(project.id);
  const rows = useMemo(
    () =>
      memories
        .filter(
          (memory) =>
            (projectId === 'all' || memory.project === projectId) &&
            (filter === 'all' || memory.state === filter) &&
            (!query.trim() ||
              `${memory.title} ${memory.excerpt} ${memory.paragraphs.join(' ')}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase())),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [memories, projectId, filter, query],
  );
  const selected = rows.find((memory) => memoryKey(memory) === selectedId) ?? rows[0];
  const selectedProject = projects.find((item) => item.id === selected?.project);

  function chooseProject(id: string) {
    setProjectId(id);
    setSelectedId('');
    setQuery('');
    setFilter('all');
    setLoading(true);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => setLoading(false), 650);
  }
  function markUseful(memory: DemoMemory) {
    if (useful.includes(memoryKey(memory))) return;
    setUseful((previous) => [...previous, memoryKey(memory)]);
    record({
      id: crypto.randomUUID(),
      title: `标记有用：${memory.title}`,
      detail: '原型模拟 · 只影响本页示例',
      tone: 'ok',
    });
  }
  function updateMemory() {
    if (!selected || !replacement.trim()) return;
    const id = crypto.randomUUID();
    const updated: DemoMemory = {
      ...selected,
      id,
      title: replacement.trim().split('\n')[0].slice(0, 45),
      excerpt: replacement.trim(),
      paragraphs: replacement.trim().split('\n').filter(Boolean),
      original: `用户在原型中输入：${replacement.trim()}`,
      source: '用户更新 · 原型模拟',
      date: new Date().toLocaleString('sv-SE', { hour12: false }).slice(0, 16),
      state: 'current',
      replaces: selected.id,
      replacedBy: undefined,
    };
    setMemories((previous) => [
      ...previous.map((memory) =>
        memoryKey(memory) === memoryKey(selected) ? { ...memory, state: 'updated' as const, replacedBy: id } : memory,
      ),
      updated,
    ]);
    setSelectedId(memoryKey(updated));
    setFilter('all');
    setQuery('');
    setUpdateOpen(false);
    setReplacement('');
    record({
      id: crypto.randomUUID(),
      title: `更新了 ${selectedProject?.name} 的记忆`,
      detail: '原型模拟 · 新旧事实关系已保留，未写入真实记忆',
      tone: 'ok',
    });
  }

  return (
    <>
      <Heading
        eyebrow="PROJECT MEMORY"
        title="经验留下来，下一次接着用。"
        description="从项目里找到决定、偏好和解决方法。无需先记住一个搜索词。"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <FolderPlus size={15} />
            加入项目
          </Button>
        }
      />
      <div className="mb-5 flex items-center gap-2 text-xs leading-5 text-rex-text-muted">
        <ShieldCheck size={15} className="shrink-0 text-rex-cyan" />
        阅读范围仅影响本页；不会改变配置目标，也不会向其他项目的 AI 共享记忆。
      </div>
      <div className="grid min-h-[570px] overflow-hidden rounded-2xl border border-rex-border bg-rex-bg lg:grid-cols-[170px_minmax(0,1fr)] xl:grid-cols-[170px_minmax(260px,.95fr)_minmax(300px,1.15fr)]">
        <aside
          aria-label="记忆项目"
          className="border-b border-rex-border bg-rex-panel/40 p-3 lg:border-r lg:border-b-0"
        >
          <p className="px-2 pt-2 pb-4 text-[11px] font-medium tracking-wide text-rex-text-muted">阅读范围</p>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            <ProjectButton name="已加入的项目" active={projectId === 'all'} onClick={() => chooseProject('all')} />
            {projects.map((item) => (
              <ProjectButton
                key={item.id}
                name={item.name}
                description={
                  projects.filter((candidate) => candidate.name === item.name).length > 1 ? item.path : undefined
                }
                active={item.id === projectId}
                locked={item.private}
                onClick={() => chooseProject(item.id)}
              />
            ))}
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-5 flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-rex-text-muted hover:text-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan"
          >
            <FolderPlus size={14} />
            加入本机项目
          </button>
          <p className="mt-5 px-2 text-[11px] leading-5 text-rex-text-muted">
            示例项目目录
            <br />
            原型不会读取本机文件
          </p>
        </aside>
        <section aria-label="记忆列表" className="min-w-0 border-b border-rex-border xl:border-r xl:border-b-0">
          <div className="border-b border-rex-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-semibold">{projectId === 'all' ? '全部项目记忆' : project?.name}</h2>
              <span className="shrink-0 text-xs text-rex-text-muted">
                {unavailable ? '不可访问' : `${rows.length} 条`}
              </span>
            </div>
            <div className="relative">
              <Search size={15} className="absolute top-3 left-3 text-rex-text-muted" />
              <input
                aria-label="搜索记忆内容"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索内容或主题…"
                className={`${fieldClass} pl-9`}
              />
            </div>
            <div className="mt-3 flex gap-1">
              {[
                ['all', '全部'],
                ['current', '当前记录'],
                ['updated', '已更新'],
                ['candidate', '待确认'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                  className={`rounded-md px-2 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-rex-cyan ${filter === id ? 'bg-rex-panel-strong font-medium text-rex-text' : 'text-rex-text-muted hover:bg-rex-panel'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div role="status">
              <Empty icon={CircleDashed} title="正在载入记忆示例…">
                此过程不读取本机文件。
              </Empty>
            </div>
          ) : unavailable ? (
            <Empty icon={FolderSearch} title="项目位置需要更新">
              <p>找不到原来的项目文件夹。已有项目登记仍然保留。</p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setRestored((previous) => [...previous, project!.id])}
              >
                模拟重新定位
              </Button>
              <p className="mt-2 text-xs">此处仅演示恢复后的状态</p>
            </Empty>
          ) : rows.length === 0 ? (
            <Empty icon={BookOpen} title={query ? '没有匹配的记忆' : '这里还没有记忆'}>
              <p>{query ? '换一个词，或清除筛选后继续浏览。' : '项目已加入。产生记忆后，会在这里按最近记录展示。'}</p>
              {query && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  清除筛选
                </Button>
              )}
            </Empty>
          ) : (
            <ul className="max-h-[540px] overflow-y-auto">
              {rows.map((memory) => (
                <li key={`${memory.project}:${memory.id}`}>
                  <button
                    onClick={() => setSelectedId(memoryKey(memory))}
                    aria-pressed={selected && memoryKey(selected) === memoryKey(memory)}
                    className={`relative w-full border-b border-rex-border px-5 py-4 text-left transition-colors duration-150 last:border-0 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-rex-cyan ${selected && memoryKey(selected) === memoryKey(memory) ? 'bg-rex-cyan/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rex-cyan' : 'hover:bg-rex-panel/60'}`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-[10px] text-rex-text-muted">
                      <span>{memory.topic}</span>
                      <span>·</span>
                      <span>{memory.date.slice(5, 10)}</span>
                      {memory.state !== 'current' && (
                        <Badge tone={MEMORY_STATE[memory.state].tone}>{MEMORY_STATE[memory.state].label}</Badge>
                      )}
                    </div>
                    <h3 className="text-sm leading-6 font-semibold">{memory.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-rex-text-muted">{memory.excerpt}</p>
                    {projectId === 'all' && (
                      <p className="mt-2 text-[10px] text-rex-text-muted">
                        {projects.find((item) => item.id === memory.project)?.name}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="记忆详情" className="min-w-0 p-6 lg:col-span-2 xl:col-span-1">
          {!selected || unavailable || loading ? (
            <Empty icon={FileText} title="让记忆有来有回">
              选择一条记录，查看完整事实、来源和它后来的变化。
            </Empty>
          ) : (
            <MemoryDetail
              memory={selected}
              project={selectedProject}
              useful={useful.includes(memoryKey(selected))}
              onUseful={() => markUseful(selected)}
              onUpdate={() => {
                setReplacement('');
                setUpdateOpen(true);
              }}
              onFollow={(id) => {
                setSelectedId(memoryKey({ project: selected.project, id }));
                setFilter('all');
                setQuery('');
              }}
            />
          )}
        </section>
      </div>
      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="加入一个本机项目"
        description="原型演示：输入项目名称和位置，体验加入后的空状态。不会读取目录或修改文件。"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const id = crypto.randomUUID();
            onAddProject({
              id,
              name: newProject.name.trim(),
              path: newProject.path.trim(),
              status: 'ready',
              private: true,
            });
            chooseProject(id);
            setNewProject({ name: '', path: '' });
            setAddOpen(false);
          }}
          className="space-y-5"
        >
          <Field label="项目名称">
            <input
              required
              value={newProject.name}
              onChange={(event) => setNewProject((previous) => ({ ...previous, name: event.target.value }))}
              className={fieldClass}
              placeholder="例如：我的私人项目"
            />
          </Field>
          <Field label="项目位置" hint="正式版通过本机文件夹选择器授权读取。">
            <input
              required
              value={newProject.path}
              onChange={(event) => setNewProject((previous) => ({ ...previous, path: event.target.value }))}
              className={fieldClass}
              placeholder="E:\projects\my-project"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button disabled={!newProject.name.trim() || !newProject.path.trim()}>加入示例列表</Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        title="更新这条事实"
        description="原型模拟：创建一条新事实，并为旧记录保留更新关系。"
      >
        <div className="mb-4 rounded-lg bg-rex-panel p-3 text-sm leading-6 text-rex-text-muted">
          原记录：{selected?.title}
        </div>
        <Field label="现在应该记住什么">
          <textarea
            rows={4}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            className={`${fieldClass} h-auto py-3`}
          />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setUpdateOpen(false)}>
            <ArrowLeft size={14} />
            取消
          </Button>
          <Button disabled={!replacement.trim()} onClick={updateMemory}>
            模拟更新
          </Button>
        </div>
      </Modal>
    </>
  );
}
