/**
 * MOTION.md 的**判据本体**：纯函数，不做 IO、不读基线、不认处置。
 *
 * 为什么单独成文件：判定（本文件）与处置（`check-motion-contract.mjs`）是两个职责。
 * 混在一起时，「这条算不算违规」和「这条存量算不算放过」两种口径共享变量，改一处会静默改另一处。
 * 本模块只回答「这份文本触发了哪些声明级事实」，处置三态由调用方决定。
 *
 * 只判 MOTION.md「判据分层」表里第一类（声明级事实）。第二类（一帧全体淡出、4px 跳变、
 * 循环接缝、光标压字）必须拍帧人眼看，本模块**不假装能判**——用正则猜「动画好不好」就是
 * 拿猜测冒充结论。
 */

/** 单次动效上限：1s。超过必须有书面理由，见 MOTION.md「时长与曲线」。 */
export const MAX_MOTION_MS = 1000;

/** 有动效就应当有减少动效兜底。 */
export const REDUCED_MOTION_QUERY = 'prefers-reduced-motion';

/**
 * 一条违规定义 = 一个代码 + 一句人话解释 + 一条出处。
 * `code` 是 disposition 的键，改它等于改基线口径，不要随手重命名。
 */
export const RULES = Object.freeze({
  transitionAll: {
    message: 'transition 用了 all：它会顺带过渡布局属性（width/height/top/left），是掉帧与抖动的主因；列出真正要过渡的属性',
    source: 'MOTION.md 时长与曲线 / 出现、移动、离开',
  },
  infiniteWithoutReducedMotion: {
    message: '无限循环动画的文件里没有 prefers-reduced-motion 兜底；减少动效下必须停下或转静态',
    source: 'MOTION.md 减少动效（硬性）',
  },
  motionWithoutReducedMotion: {
    message: '有 animation/transition 却完全没有 prefers-reduced-motion 兜底；减少动效是硬性要求',
    source: 'MOTION.md 减少动效（硬性）',
  },
  durationOverCeiling: {
    message: `单次动效时长超过 ${MAX_MOTION_MS}ms；超限必须有书面理由，否则是拖沓不是从容`,
    source: 'MOTION.md 时长与曲线',
  },
});

/**
 * 豁免写法：`/* motion-contract: allow <code> — <reason> *\/`
 *
 * 必须**点名 code 并给理由**。否则一个注释会静默盖住同文件后续所有新增违规；
 * code 写错或理由为空都算无效豁免，无效即红灯。
 */
const EXEMPTION_PATTERN = /motion-contract:\s*allow\s+([A-Za-z]+)\s*(?:—|--|:)\s*([^\n*]+)/gu;

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, ' ');
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/gu, ' ');
}

/**
 * 移除 `@media (prefers-reduced-motion: reduce) { ... }` 整块（含嵌套大括号）。
 *
 * 只剥 `reduce`，**不剥 `no-preference`**：后者恰恰是「有动效」那一支，把它一起剥掉会让块内的
 * 时长/属性声明凭空消失，于是超时违规漏报——这是把「检查器坏了」报成「仓库干净」。
 * 必须按大括号配对剥而不是按行剥：按行会在块内第一个 `}` 后把外部规则当成块内。
 */
export function stripReducedMotionBlocks(cssText) {
  let out = '';
  let cursor = 0;
  for (;;) {
    const at = cssText.indexOf('@media', cursor);
    if (at < 0) return out + cssText.slice(cursor);
    const open = cssText.indexOf('{', at);
    if (open < 0) return out + cssText.slice(cursor);
    const prelude = cssText.slice(at, open);
    let depth = 0;
    let end = -1;
    for (let i = open; i < cssText.length; i += 1) {
      if (cssText[i] === '{') depth += 1;
      else if (cssText[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) return out + cssText.slice(cursor);
    const isReduce = prelude.includes(REDUCED_MOTION_QUERY) && /:?\s*reduce\b/u.test(prelude);
    out += isReduce ? `${cssText.slice(cursor, at)} ` : cssText.slice(cursor, end);
    cursor = end;
  }
}

/** `500ms` / `1.2s` / `0.35s` → 毫秒；无法解析返回 null。 */
export function parseDurationMs(token) {
  const match = /^([0-9]*\.?[0-9]+)(ms|s)$/u.exec(String(token).trim());
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === 's' ? value * 1000 : value;
}

function collectDurations(value) {
  const durations = [];
  for (const token of String(value).split(/[\s,]+/u)) {
    const parsed = parseDurationMs(token);
    if (parsed !== null) durations.push(parsed);
  }
  return durations;
}

/**
 * 按**声明**收集某个属性族的取值（family 是一个不含捕获组的正则源）。
 * 一处声明只产出一项。这是去重的唯一 owner，调用方不得再加第二条同族正则。
 */
function declaredValues(source, family) {
  const pattern = new RegExp(`(?:^|[;{\\s])(?:${family.source})\\s*:([^;}]+)`, 'gu');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/**
 * 纯函数：给一份文件的文本，返回它触发的所有声明级违规。
 * 不做 IO，不读 baseline —— 处置（exempt/baseline/violation）是另一层。
 */
export function analyzeSource({ filePath, content }) {
  const raw = String(content);
  const isCss = filePath.endsWith('.css');
  let text = isCss ? stripCssComments(raw) : stripHtmlComments(raw);
  // HTML 里内联的 <style> 也要走 CSS 口径，否则 style 块里的 @media 兜底会被当成不存在。
  if (!isCss) {
    text = text.replace(
      /(<style[^>]*>)([\s\S]*?)(<\/style>)/giu,
      (_m, open, css, close) => `${open}${stripCssComments(css)}${close}`,
    );
  }

  // 豁免写在**注释**里，而 text 已经剥过注释。必须从 raw 里找，否则只要写豁免就永远匹配不到
  // （读反了会把「有理由的豁免」报成违规，把「没理由」报成合法）。
  const exemptions = [...raw.matchAll(EXEMPTION_PATTERN)]
    .map((match) => ({ code: match[1].trim(), reason: match[2].trim() }))
    .filter((entry) => entry.reason.length > 0 && Object.hasOwn(RULES, entry.code));
  const hasReducedMotion = text.includes(REDUCED_MOTION_QUERY);

  // 只看「没有兜底」时的动效：有兜底的文件不再报 motionWithoutReducedMotion。
  const outsideReduced = stripReducedMotionBlocks(text);

  const findings = [];
  const push = (code, detail) => findings.push({ code, detail });

  for (const value of declaredValues(outsideReduced, /transition(?:-property)?/u)) {
    if (/\ball\b/u.test(value)) push('transitionAll', `transition: ${value.trim().slice(0, 60)}`);
  }
  for (const value of declaredValues(outsideReduced, /transition/u)) {
    for (const duration of collectDurations(value)) {
      if (duration > MAX_MOTION_MS) push('durationOverCeiling', `transition ${Math.round(duration)}ms`);
    }
  }

  // `animation` 简写会被多条正则同时命中（duration / iteration-count），
  // 分别收集就会把同一个声明数成两条违规。用 declaredValues 一处声明只取一项。
  const animationValues = declaredValues(outsideReduced, /animation(?:-[a-z-]+)?/u);
  const hasAnimation = animationValues.length > 0;
  const hasTransition = declaredValues(outsideReduced, /transition(?:-[a-z-]+)?/u).length > 0;
  const hasInfinite = animationValues.some((value) => /\binfinite\b/u.test(value));
  for (const value of animationValues) {
    for (const duration of collectDurations(value)) {
      // animation 简写里的时间位既可能是 duration 也可能是 delay，取保守判据：超上限就报。
      if (duration > MAX_MOTION_MS) push('durationOverCeiling', `animation ${Math.round(duration)}ms`);
    }
  }

  if (!hasReducedMotion) {
    if (hasInfinite) push('infiniteWithoutReducedMotion', 'animation … infinite');
    else if (hasAnimation || hasTransition) push('motionWithoutReducedMotion', 'animation/transition');
  }

  return { findings, exemptions, hasReducedMotion, hasAnimation, hasTransition, hasInfinite };
}
