// Final image+copy pass: replace stale test-evidence screenshots with LIVE captures
// of the current AIOS Console, and rebuild #how as a real gateway section using
// the actual client→gateway→provider flow screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(ROOT, 'landing/index.html');
let html = fs.readFileSync(file, 'utf8');
const swap = (from, to, count = 1) => {
  const n = html.split(from).length - 1;
  if (n !== count) throw new Error(`expected ${count} match(es), got ${n} for:\n${from.slice(0, 180)}`);
  html = html.replaceAll(from, to);
  console.log('ok:', from.slice(0, 60).replace(/\s+/g, ' '));
};
const replaceSection = (id, section) => {
  const start = html.indexOf(`  <section id="${id}">`);
  if (start === -1) throw new Error('section not found: ' + id);
  const next = html.indexOf('\n  <section', start + 1);
  if (next === -1) throw new Error('next section not found: ' + id);
  html = html.slice(0, start) + section + html.slice(next + 1);
  console.log('replaced section:', id);
};
const IMG = 'assets/media/aios';
// live screenshots are 1440x900; for wide slots use width 1440 height 900.
const pair = (name, alt) => `      <img class="for-light" loading="eager" src="${IMG}/${name}" width="1440" height="900" alt="${alt}">
      <img class="for-dark" loading="eager" src="${IMG}/${name}" width="1440" height="900" alt="${alt}">`;

// Hero: live home console.
swap(
  `      <img loading="eager" class="pick for-light" src="${IMG}/real-acc-overview.png" width="1280" height="720" alt="AIOS 控制台总览：十三个客户端的接入状态、能力清单与证据覆盖">
      <img loading="eager" class="pick for-dark" src="${IMG}/real-acc-overview.png" width="1280" height="720" alt="AIOS 控制台总览：十三个客户端的接入状态、能力清单与证据覆盖">`,
  `      <img loading="eager" class="pick for-light" src="${IMG}/live-home.png" width="1440" height="900" alt="AIOS 控制台首页：客户端与模型、最近请求与配置默认">
      <img loading="eager" class="pick for-dark" src="${IMG}/live-home.png" width="1440" height="900" alt="AIOS 控制台首页：客户端与模型、最近请求与配置默认">`
);
swap(
  '<p class="lede">AIOS 是本地优先的 Graph Engine。打开控制台，每个客户端接进了没有、哪些能力可用、证据覆盖到哪、现在卡在哪——一屏看清。不用改你的工作方式。</p>',
  '<p class="lede">AIOS 是本地优先的 Graph Engine。打开控制台，每个客户端用哪个模型、最近请求走到了哪、配置默认是什么——一屏看清。不用改你的工作方式。</p>'
);

// #how -> real gateway section with the live flow screenshot.
replaceSection('how', `  <section id="how">
    <p class="eyebrow">模型网关</p>
    <h2>一个网关，通吃所有客户端和模型。</h2>
    <p class="sub">AIOS 在你本机跑一个网关（127.0.0.1:8686，上游 magpie）。请求先从客户端到本机网关，再经网关落到模型；有条件的账号优先、失败后退避并转移，每一次决策都实时写在请求记录里。下图是控制台里真实的路由视图。</p>
    <div class="wide">
${pair('live-gateway-flow.png', 'AIOS 网关路由图：默认客户端、Claude Code、Pi 经 AIOS 网关路由到 antigravity、qoder-cn、qwenwork、opencode-go 等模型，显示 37 请求、13 模型、21 错误')}
    </div>
    <div class="grid" style="margin-top:32px">
      <div><h3>一次接入，处处可用</h3><p>网关把客户端和模型解耦：客户端只认一个本地地址，模型随时可换。</p></div>
      <div><h3>按条件路由</h3><p>有条件的账号优先；额度、失败退避和上游优先级都参与选路。</p></div>
      <div><h3>决策实时可见</h3><p>每条请求的路由、命中的模型与状态写进记录，不靠猜。</p></div>
      <div><h3>失败自动转移</h3><p>出错的账号退避后再试，换到下一个可用账号，不打断你的 Agent。</p></div>
      <div><h3>本地运行</h3><p>网关跑在你自己的机器上，密钥与请求记录都不离开这台电脑。</p></div>
      <div><h3>注册表可见</h3><p>接入了哪些客户端、各自用哪个模型，控制台里逐条列清。</p></div>
    </div>
  </section>`);

// #team -> live Agent clients page (real capability onboarding).
replaceSection('team', `  <section id="team">
    <div class="split rev">
      <div>
${pair('live-tools.png', 'AIOS Agent 客户端页：Claude Code、Codex、Gemini CLI、Grok、Hermes 等客户端的模型分配与接入开关')}
      </div>
      <div>
        <p class="eyebrow">客户端接入</p>
        <h2>打开「接入」，网关模型就出现在客户端里。</h2>
        <p class="sub">Agent 客户端页列出本机发现的每个客户端、它的版本与配置落点。给某个客户端选好模型、打开接入，网关的模型就会作为可选项出现在它的列表里。</p>
        <ul>
          <li><b>自动发现</b> 从本机读客户端与版本，不靠一份手填清单。</li>
          <li><b>模型分配</b> 每个客户端单独选「AIOS Auto」或指定模型。</li>
          <li><b>接入开关</b> 写入后会备份配置，需要时可还原。</li>
          <li><b>方案</b> 保存当前设置，之后一键切回。</li>
        </ul>
      </div>
    </div>
  </section>`);

// #verify -> live resources/MCP page.
replaceSection('verify', `  <section id="verify">
    <p class="eyebrow">资源库</p>
    <h2>服务装在哪里、谁的、读没读到。</h2>
    <p class="sub">MCP 服务、Skills 和 Subagents 在一页里读清楚：服务配置实例数、可读落点数、归属与读取状态都来自本机，不是一份装饰清单。</p>
    <div class="wide">
${pair('live-resources.png', 'AIOS 资源库 MCP 页：服务实例数、落点、归属与落点验证状态的服务清单')}
    </div>
    <div class="grid" style="margin-top:32px">
      <div><h3>一处汇总</h3><p>MCP、Skills、Subagents 三个标签，资源不再散落各处。</p></div>
      <div><h3>落点可查</h3><p>每个服务从哪份配置读到、归属谁，逐条列出。</p></div>
      <div><h3>状态诚实</h3><p>已验证、未验证、未覆盖分开标注，不把"读到配置"说成"能连上"。</p></div>
      <div><h3>只读采集</h3><p>页面只读本机配置，不启动服务、不改你的设置。</p></div>
      <div><h3>预览再安装</h3><p>添加 MCP 先 dry-run 预览，确认后才写入。</p></div>
      <div><h3>本机事实</h3><p>所有数字来自当前工作区的一次真实采集，切换工作区会跟着变。</p></div>
    </div>
  </section>`);

// #memory -> live memory page.
replaceSection('memory', `  <section id="memory">
    <p class="eyebrow">项目记忆</p>
    <h2>经验留下来，下一次接着用。</h2>
    <p class="sub">本机记忆按 space 与 scope 列清：哪些是项目内共享、哪些是常驻，搜索一次真实 memo，上下文就能接着上一次继续。</p>
    <div class="wide">
${pair('live-memory.png', 'AIOS 项目记忆页：182 条记忆、space 列表、搜索框与一条记忆的详情')}
    </div>
    <div class="subs" style="margin-top:32px">
      <div><div class="who"><img class="bird" src="${IMG}/mark.png" alt="">按 space 组织</div><p>记忆按命名空间与适用范围列清，项目内共享一目了然。</p></div>
      <div><div class="who"><img class="bird" src="${IMG}/mark.png" alt="">常驻记忆</div><p>每个会话都会注入的那份事实，字符数与截断状态直接显示。</p></div>
      <div><div class="who"><img class="bird" src="${IMG}/mark.png" alt="">召回有反馈</div><p>哪条记忆有用可以标记，后续召回更准。</p></div>
    </div>
  </section>`);

// #guarded -> real activity page (activity trail, not a retired matrix).
replaceSection('guarded', `  <section id="guarded">
    <p class="eyebrow">活动记录</p>
    <h2>每一次改变，都有迹可循。</h2>
    <p class="sub">这里列出这台机器上真实存在过的会话记录，来自本地会话库：哪个工作区、哪次任务、跑了什么，用事实回答，而不是一句"我们很透明"。</p>
    <div class="wide">
${pair('live-activity.png', 'AIOS 活动记录页：真实会话列表，含工作区、客户端、状态与事件数')}
    </div>
  </section>`);

// #sessions -> drop duplicate (activity already covers it). Reuse live home? Remove it.
const s = html.indexOf('  <section id="sessions">');
if (s !== -1) {
  const e = html.indexOf('\n  <section', s + 1);
  html = html.slice(0, s) + html.slice(e + 1);
  console.log('removed section: sessions (duplicate of activity)');
}

fs.writeFileSync(file, html);
console.log('\nlive console screenshots applied');
