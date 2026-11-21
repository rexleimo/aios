// Replace concept-art product images with REAL AIOS console screenshots from
// docs/reports/evidence/shell-console-2026-11/, and rewrite each section's copy
// so it describes exactly what that screenshot shows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(ROOT, 'landing/index.html');
let html = fs.readFileSync(file, 'utf8');

const swap = (from, to, count = 1) => {
  const n = html.split(from).length - 1;
  if (n !== count) throw new Error(`expected ${count} match(es), got ${n} for:\n${from.slice(0, 200)}`);
  html = html.replaceAll(from, to);
  console.log('ok:', from.slice(0, 64).replace(/\s+/g, ' '));
};
const replaceSection = (id, section) => {
  const start = html.indexOf(`  <section id="${id}">`);
  if (start === -1) throw new Error('section not found: ' + id);
  const next = html.indexOf('\n  <section', start + 1);
  if (next === -1) throw new Error('next section not found for: ' + id);
  html = html.slice(0, start) + section + html.slice(next + 1);
  console.log('replaced section:', id);
};
const IMG = 'assets/media/aios';
const pair = (name, alt) => `      <img class="for-light" loading="eager" src="${IMG}/${name}" width="1280" height="720" alt="${alt}">
      <img class="for-dark" loading="eager" src="${IMG}/${name}" width="1280" height="720" alt="${alt}">`;

// Hero — overview console screenshot + copy describing what it shows.
swap(
  '<p class="lede">AIOS 是本地优先的 Graph Engine。它把你现有的编码客户端接进一张项目图：工作流模式、任务计划、实时推理和产物，都在一个界面里看得见——不用改你的工作方式。</p>',
  '<p class="lede">AIOS 是本地优先的 Graph Engine。打开控制台，每个客户端接进了没有、哪些能力可用、证据覆盖到哪、现在卡在哪——一屏看清。不用改你的工作方式。</p>'
);
swap(
  `      <img loading="eager" class="pick for-light" src="assets/media/aios/portrait.png" width="440" height="440" alt="AIOS 任务执行界面：工作流模式、任务计划、实时推理与产物">
      <img loading="eager" class="pick for-dark" src="assets/media/aios/portrait.png" width="440" height="440" alt="AIOS 任务执行界面：工作流模式、任务计划、实时推理与产物">`,
  `      <img loading="eager" class="pick for-light" src="${IMG}/real-acc-overview.png" width="1280" height="720" alt="AIOS 控制台总览：十三个客户端的接入状态、能力清单与证据覆盖">
      <img loading="eager" class="pick for-dark" src="${IMG}/real-acc-overview.png" width="1280" height="720" alt="AIOS 控制台总览：十三个客户端的接入状态、能力清单与证据覆盖">`
);

// Nav: the #team section is now 能力配置.
swap('<a class="hide" href="#team">多智能体</a>', '<a class="hide" href="#team">能力配置</a>');
swap(
  '    <a class="hide" href="#workflow">工作流</a>',
  '    <a class="hide" href="#workflow">工作流</a>\n    <a class="hide" href="#guarded">接入矩阵</a>'
);

// #team — real 设置 (capability switches) screenshot.
replaceSection('team', `  <section id="team">
    <div class="split rev">
      <div>
${pair('real-acc-settings-edit.png', 'AIOS 设置页：按客户端逐项声明能力开关、目标等级与行级限制')}
      </div>
      <div>
        <p class="eyebrow">能力配置</p>
        <h2>每项能力，都能单独开关。</h2>
        <p class="sub">每个客户端的会话注入、请求改写、受控 Shell、MCP 代理等能力逐项声明。目标等级和行级限制写在同一页，改完保存，先备份再验证。</p>
        <ul>
          <li><b>能力开关</b> 会话注入、请求改写、受控 Shell、MCP 代理等逐项声明。</li>
          <li><b>目标等级</b> 每个客户端单独设 L1 / L2 / L3，等级决定它拿到多少能力。</li>
          <li><b>行级限制</b> 按客户端写限制文本，原样保存、原样读回。</li>
          <li><b>先备份后验证</b> 保存时写备份，再用 <code>aios status</code> 验证整条链路。</li>
        </ul>
      </div>
    </div>
  </section>`);

// #verify — real 设置回滚 screenshot (verification-failed banner).
replaceSection('verify', `  <section id="verify">
    <p class="eyebrow">安全回滚</p>
    <h2>写坏了？自动回到上一个可用版本。</h2>
    <p class="sub">保存配置会先写备份，再跑一遍验证。验证不过——脚本找不到、链路断了——页面直接标红失败原因，并说清备份落在哪，不用手动翻日志。</p>
    <div class="wide">
${pair('real-acc-settings-rollback.png', 'AIOS 设置页：验证失败提示与自动回滚到的备份路径')}
    </div>
    <div class="grid" style="margin-top:32px">
      <div><h3>保存前备份</h3><p>每次保存先写一份带时间戳的备份，改坏了有路可退。</p></div>
      <div><h3>链路验证</h3><p>保存后用 <code>aios status</code> 验证整条能力链路还能不能跑。</p></div>
      <div><h3>失败即标红</h3><p>验证失败直接显示原始错误，不吞异常、不糊成一句“失败”。</p></div>
      <div><h3>备份可追溯</h3><p>页面写明回滚到了哪份备份，路径和文件名都在。</p></div>
      <div><h3>原样写回</h3><p>能力开关、等级和行级限制原样保存，不重排、不丢注释。</p></div>
      <div><h3>证据留存</h3><p>验证输出与回滚记录留在本地，事后能查当时发生了什么。</p></div>
    </div>
  </section>`);

// #memory — real 记忆 screenshot.
replaceSection('memory', `  <section id="memory">
    <p class="eyebrow">项目记忆</p>
    <h2>项目里发生过什么，都记得。</h2>
    <p class="sub">记忆页把事件、固定记忆、召回反馈和开销放在一起：搜一个关键词就能回到当时的条目，谁被召回过、有没有用，也有数。</p>
    <div class="wide">
${pair('real-v2-memory.png', 'AIOS 记忆页：事件统计、固定记忆、搜索与召回反馈')}
    </div>
    <div class="subs" style="margin-top:32px">
      <div><div class="who"><img class="bird" src="${IMG}/mark.png" alt="">事件</div><p>每次会话、每次裁定都留下事件，数量和时间一目了然。</p></div>
      <div><div class="who"><img class="bird" src="${IMG}/mark.png" alt="">固定记忆</div><p>每个会话都会注入的确定性事实，字符数和截断状态直接显示。</p></div>
      <div><div class="who"><img class="bird" src="${IMG}/mark.png" alt="">召回反馈</div><p>被召回的记忆有没有用，单独计数——没用的不留下。</p></div>
    </div>
  </section>`);

// #guarded — real 接入矩阵 screenshot.
replaceSection('guarded', `  <section id="guarded">
    <p class="eyebrow">接入矩阵</p>
    <h2>接进了哪些能力，一张矩阵看清。</h2>
    <p class="sub">矩阵一格只表达一件事：配置里是否声明了这条能力。逻辑原因不在格里——点客户端就能看原文与证据。灰、蓝、橙、红分别代表未声明、已声明、待验证和证据阻断。</p>
    <div class="wide">
${pair('real-acc-matrix-action.png', 'AIOS 接入矩阵：十三种客户端与会话注入、请求改写、受控 Shell、MCP 代理等能力的覆盖情况')}
    </div>
  </section>`);

// New #sessions section using the last real screenshot, inserted before #features.
swap(
  '  <section id="features">',
  `  <section id="sessions">
    <p class="eyebrow">会话记录</p>
    <h2>走到哪一步、检查点说了什么，都留着。</h2>
    <p class="sub">ContextDB 记下每一次会话：想做什么、跑了哪些事件、检查点写了什么。左边是会话列表，右边是摘要和检查点，续做不用猜上次停在哪。</p>
    <div class="wide">
${pair('real-v2-sessions.png', 'AIOS 会话页：ContextDB 会话列表、摘要与检查点')}
    </div>
  </section>

  <section id="features">`
);

fs.writeFileSync(file, html);
console.log('\nreal screenshots applied');
