// Build /getting-started/ and /blog/ as the SAME visual as the finished home page:
// reuse index.html's <head>, <nav>, <footer> and stylesheet; only swap <main>.
// Content comes from real docs-site/getting-started.md and blog-site frontmatter.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LANDING = path.join(ROOT, 'landing');
let home = fs.readFileSync(path.join(LANDING, 'index.html'), 'utf8');

// Shared shell extracted from the finished home page.
const head = home.slice(0, home.indexOf('<body>') + '<body>'.length);
const navStart = home.indexOf('<nav id="nav">');
const navEnd = home.indexOf('</nav>', navStart) + '</nav>'.length;
const nav = home.slice(navStart, navEnd);
const footerStart = home.indexOf('<footer>');
const footerEnd = home.indexOf('</footer>', footerStart) + '</footer>'.length;
const footer = home.slice(footerStart, footerEnd);
const scriptsStart = home.indexOf('<script>', footerEnd);
const scripts = home.slice(scriptsStart);

// Make nav section links absolute so they work from /getting-started/ and /blog/.
const absNav = nav.replace(/href="#([a-z]+)"/g, 'href="/#$1"')
  .replace(/href="\/#/g, 'href="/#');

const shell = (title, description, main) => `${head.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)}
${absNav}

<main class="wrap">
${main}
</main>

${footer}
${scripts}`;

// ---------- Getting Started ----------
const gettingStarted = `
  <header class="hero" style="grid-template-columns:1fr; padding-top:64px; gap:0">
    <div>
      <p class="eyebrow">快速上手</p>
      <h1>30 秒，让 Agent <span>真正把活干完。</span></h1>
      <p class="lede">安装 AIOS，运行 <code>aios init --all</code>，然后用一句话交代复杂任务。你不换客户端、不改工作方式——记忆、验证与协作都加在下面。</p>
      <div class="meta">Node.js 24 LTS · Git · 支持 Codex / Claude Code / Gemini CLI / OpenCode / Hermes / Grok</div>
    </div>
  </header>

  <section id="install" style="padding-top:24px">
    <p class="eyebrow">第 1 步 · 安装</p>
    <h2>一条命令装好。</h2>
    <p class="sub">推荐用发布安装脚本；只在确实需要未发布源码时才 clone 仓库。macOS / Linux 与 Windows 各一条命令。</p>
    <div class="install"><code id="cmd-install">curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash</code><button class="copy" data-copy="cmd-install">复制</button></div>
    <p class="meta" style="margin-top:10px">Windows PowerShell：<code>irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex</code>，然后 <code>. $PROFILE</code>。</p>
    <pre><span class="c"># 检查 Node.js 版本</span>
node -v   <span class="c"># 需要 v24 LTS</span>
npm -v</pre>
  </section>

  <section id="init">
    <p class="eyebrow">第 2 步 · 初始化项目</p>
    <h2>在项目根目录跑一次。</h2>
    <p class="sub"><code>aios init --all</code> 写入项目标记、同步仓库里已有的客户端指令。重复运行是安全的，不会破坏你的配置。</p>
    <pre><span class="c"># 在项目根目录</span>
aios init --all
aios doctor --native --verbose   <span class="c"># 立刻体检</span>

<span class="c"># 无人值守：把外部权限写清楚</span>
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
<span class="c"># --dry-run 只预览，不下载、不写客户端配置</span></pre>
  </section>

  <section id="client">
    <p class="eyebrow">第 3 步 · 启动客户端</p>
    <h2>照你原来的方式打开。</h2>
    <p class="sub">在同一个项目目录里启动任一支持的客户端。客户端通过项目注册表按需取指令和记忆，不需要你手动搬运上下文。</p>
    <pre>codex
<span class="c"># 或：claude / gemini / opencode / hermes / grok</span></pre>
  </section>

  <section id="verify">
    <p class="eyebrow">第 4 步 · 验证</p>
    <h2>看真实检查，不看装饰。</h2>
    <p class="sub">启动客户端后再跑一次 doctor，确认记忆、客户端同步与安全检查都通过；警告不等于某条路由真的能用，要跑一个小任务并保留输出。</p>
    <pre>aios doctor --native --verbose
ls .aios/context-db/</pre>
  </section>

  <aside class="community" aria-label="下一步">
    <a href="/blog/">
      <span class="glyph"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16v2H4zm0 5h16v2H4zm0 5h11v2H4zm0 5h16v2H4z"></path></svg></span>
      <div><b>继续读博客</b><span>发布记录、架构决策与真实工程复盘，都在博客里。</span></div>
      <i aria-hidden="true">→</i>
    </a>
  </aside>`;

fs.mkdirSync(path.join(LANDING, 'getting-started'), { recursive: true });
fs.writeFileSync(path.join(LANDING, 'getting-started/index.html'),
  shell('快速上手 — AIOS', '安装 AIOS 并在 30 秒内开始用一句话完成复杂任务。', gettingStarted));

// ---------- Blog ----------
// Extract real posts from blog-site frontmatter (title/description/date).
const posts = [];
for (const f of fs.readdirSync(path.join(ROOT, 'blog-site')).filter(f => f.endsWith('.md')).sort().reverse()) {
  const txt = fs.readFileSync(path.join(ROOT, 'blog-site', f), 'utf8');
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  const fm = m[1];
  const get = (k) => (fm.match(new RegExp('^' + k + ':\\s*"?([^"\\n]+)"?', 'm')) || [])[1]?.trim();
  const title = get('title'), date = get('date'), desc = get('description');
  if (!title) continue;
  posts.push({ title, date: date || '', desc: desc || '', slug: f.replace(/\.md$/, '') });
}
const shown = posts.slice(0, 24);
const cards = shown.map(p => `      <div class="card" style="display:block;padding:22px">
        <h3 style="margin:0 0 8px;font-size:17px">${p.title.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</h3>
        <p style="margin:0 0 10px;font-size:14px">${p.desc.replace(/&/g,'&amp;').replace(/</g,'&lt;').slice(0,150)}</p>
        <span style="font-size:13px;color:var(--ink3)">${p.date}</span>
      </div>`).join('\n');

const blog = `
  <header class="hero" style="grid-template-columns:1fr; padding-top:64px; gap:0">
    <div>
      <p class="eyebrow">博客</p>
      <h1>Agent 工程的<span>真实复盘。</span></h1>
      <p class="lede">发布记录、架构决策与可复核的工程实验——来自正在构建 AIOS 的团队，不是营销文案。</p>
      <div class="meta">共 ${posts.length} 篇 · 中文/English/日本語/한국어</div>
    </div>
  </header>

  <section style="padding-top:24px">
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">
${cards}
    </div>
  </section>`;

fs.mkdirSync(path.join(LANDING, 'blog'), { recursive: true });
fs.writeFileSync(path.join(LANDING, 'blog/index.html'),
  shell('博客 — AIOS', 'AIOS 团队的发布记录、架构决策与工程复盘。', blog));

console.log('built getting-started and blog pages with', posts.length, 'real posts');
