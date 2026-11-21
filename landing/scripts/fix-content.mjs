// Fix 3 review points: image/copy alignment, 3-per-row capability grid, client marks.
// Every replacement asserts its match count so a stale source fails loudly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(ROOT, 'landing/index.html');
let html = fs.readFileSync(file, 'utf8');

const swap = (from, to, count = 1) => {
  const n = html.split(from).length - 1;
  if (n !== count) throw new Error(`expected ${count} match(es), got ${n} for:\n${from.slice(0, 160)}`);
  html = html.replaceAll(from, to);
  console.log('ok:', from.slice(0, 70).replace(/\s+/g, ' '));
};

// ---- 1a. Hero copy: portrait.png shows the task/workflow execution UI ----
swap(
  '<h1>让每个 Agent，<span>真正记住你的项目。</span></h1>',
  '<h1>让每个 Agent，<span>把任务真正做完。</span></h1>'
);
swap(
  '<p class="lede">AIOS 是本地优先的 Graph Engine。它在你已经在用的编码客户端之上，叠加跨会话项目记忆、自适应工作流、多智能体协作和交付前验证——不用改你的工作方式。</p>',
  '<p class="lede">AIOS 是本地优先的 Graph Engine。它把你现有的编码客户端接进一张项目图：工作流模式、任务计划、实时推理和产物，都在一个界面里看得见——不用改你的工作方式。</p>'
);
swap(
  'alt="AIOS 任务计划界面：工作流模式、任务进度与实时推理"',
  'alt="AIOS 任务执行界面：工作流模式、任务计划、实时推理与产物"',
  2
);

// ---- 1b. "context" section used dashboard.png (Guarded Mode workbench) ----
// Replace the whole heading block so copy matches the actual screenshot.
swap(
  `    <p class="eyebrow">上下文工程</p>
    <h2>该记的记下来，该压的压下去。</h2>
    <p class="sub">长会话的上下文不靠“祈祷”。AIOS 把超过阈值的工具输出存成本地引用，只把摘要和关键行留在上下文里，需要时再召回——完整证据不丢，token 却省下来了。</p>`,
  `    <p class="eyebrow">守护模式</p>
    <h2>Agent 动手之前，先过一道策略。</h2>
    <p class="sub">守护模式下，工具调用受策略约束：哪些目录能写、哪些命令能跑、哪些动作要拦，都写在配置里。工作台上看得到每个 Agent 在做什么、终端里跑过什么——放行与拦截都有据可查。</p>`
);
swap(
  'alt="AIOS 工作台：守护模式下的多 agent 运行状态与终端输出"',
  'alt="AIOS 守护模式工作台：多个 Agent 在策略约束下并行运行，终端显示初始化与执行输出"',
  2
);
swap('<section id="context">', '<section id="guarded">');

// ---- 2. Capability strip: 3 per row, add a 6th capability ----
swap(
  `<style>
.cap-glyph { flex: none; display: grid; place-items: center; width: 124px; height: 96px; color: var(--ink); }
.cap-glyph svg { width: 62px; height: 62px; }
@media (max-width: 560px) { .cap-glyph { width: 88px; height: 60px; } .cap-glyph svg { width: 48px; height: 48px; } }
</style>`,
  `<style>
.sponsor .cards { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; }
.sponsor .card { gap: 14px; padding: 18px; }
.cap-glyph { flex: none; display: grid; place-items: center; width: 76px; height: 76px; color: var(--ink); }
.cap-glyph svg { width: 44px; height: 44px; }
.client-mark { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; background: var(--code); color: var(--ink2); font-size: 9px; font-weight: 700; letter-spacing: -.02em; }
@media (max-width: 860px) { .sponsor .cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .sponsor .cards { grid-template-columns: 1fr; } .cap-glyph { width: 88px; height: 60px; } .cap-glyph svg { width: 48px; height: 48px; } }
</style>`
);
const sixth = `      <div class="card"><span class="cap-glyph"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10h24v28H12z"></path><path d="M18 17h12M18 24h12M18 31h7"></path><path d="m30 36 3 3 6-8"></path></svg></span><hr><span>上下文压缩：长输出存成本地引用，摘要留在上下文，需要时再召回。</span></div>\n`;
swap(
  `      <div class="card"><span class="cap-glyph"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6 38 11v11c0 9-6 15-14 19-8-4-14-10-14-19V11L24 6Z"></path><path d="m18 24 4 4 8-9"></path></svg></span><hr><span>交付前验证：构建、类型、测试、密钥扫描自动跑一遍。</span></div>
    </div>`,
  `      <div class="card"><span class="cap-glyph"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6 38 11v11c0 9-6 15-14 19-8-4-14-10-14-19V11L24 6Z"></path><path d="m18 24 4 4 8-9"></path></svg></span><hr><span>交付前验证：构建、类型、测试、密钥扫描自动跑一遍。</span></div>
${sixth}    </div>`
);

// ---- 3. Client marks: HE / WB / QO (no correct official icons available) ----
swap('<img class="bird" src="assets/media/icons/hermes.svg" alt="">Hermes', '<span class="client-mark">HE</span>Hermes', 2);
swap('<img class="bird" src="assets/media/aios/mark.png" alt="">WorkBuddy', '<span class="client-mark">WB</span>WorkBuddy');
swap('<img class="bird" src="assets/media/aios/mark.png" alt="">Qoder', '<span class="client-mark">QO</span>Qoder');

fs.writeFileSync(file, html);
console.log('\nall content fixes applied');
