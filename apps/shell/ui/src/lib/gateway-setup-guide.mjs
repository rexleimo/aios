// 网关总览的「一眼就懂」引导：把真实运行状态映射成三步清单与唯一“下一步”。
// 纯函数——不联网、不读 React 状态；输入就是 GatewayControl 已经拿到的 status。
// 判定只使用可观测事实：进程是否运行、是否就绪、是否有就绪模型、是否已接入客户端、
// 是否已配置模型；绝不从历史请求推断在线或健康。

const connectedCount = (status) => (Array.isArray(status?.clients)
  ? status.clients.filter((item) => item?.connected).length
  : 0);

// 下一步动作是唯一事实源：标签与派发共用它，避免多处 if 级联漂移。
// kind ∈ loading | start | providers | connect | ready。
const NEXT_ACTIONS = Object.freeze({
  loading: { label: '读取状态中', step: null },
  start: { label: '启动网关', step: 'start' },
  providers: { label: '配置模型来源', step: 'models' },
  connect: { label: '接入第一个客户端', step: 'connect' },
  ready: { label: '', step: null },
});

/**
 * 派生三步引导。每步 { key, title, detail, state }，state ∈ done | next | todo。
 * 返回 nextAction（标签 + 目标步骤）供 UI 直接消费，不再重复判定 nextStep。
 */
export function deriveSetupGuide(status, { pending = false, modelCount } = {}) {
  const running = status?.running === true && !status?.stale;
  const ready = running && status?.ready === true;
  const connected = connectedCount(status);
  const configured = (status?.configuredModelCount ?? modelCount ?? 0) > 0;

  // 下一步按依赖顺序决定；判定与动作在同一处，消除重复 switch。
  // 就绪失败(有来源但不可用，例如缺凭据)指向“配置模型来源”——那是能解决它的地方。
  let kind;
  if (pending) kind = 'loading';
  else if (!running) kind = 'start';
  else if (!configured || !ready) kind = 'providers';
  else if (connected === 0) kind = 'connect';
  else kind = 'ready';
  const nextAction = NEXT_ACTIONS[kind];
  const nextStep = nextAction.step;

  const steps = [
    {
      key: 'start',
      title: '启动网关',
      detail: running ? (status?.managed ? '网关正在本机运行' : '网关由外部进程运行，界面无法停止') : '在本机启动一个只监听 127.0.0.1 的网关',
      state: running ? 'done' : 'todo',
    },
    {
      key: 'models',
      title: '配置模型来源',
      detail: configured ? (ready ? '已绑定且网关已加载模型' : '已保存来源，但网关尚未加载出可路由模型') : '添加供应商并绑定模型，网关才知道把请求交给谁',
      state: (configured && ready) ? 'done' : 'todo',
    },
    {
      key: 'connect',
      title: '接入客户端',
      detail: connected > 0 ? `${connected} 个客户端已指向网关` : '把网关地址写入客户端配置，普通命令即走网关',
      state: connected > 0 ? 'done' : 'todo',
    },
  ];

  const marked = steps.map((step) => ({
    ...step,
    state: step.key === nextStep ? 'next' : step.state,
  }));
  return { steps: marked, nextStep, nextAction, kind, connected, running, ready };
}
