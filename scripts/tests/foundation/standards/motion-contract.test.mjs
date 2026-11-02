/**
 * MOTION.md 声明级判据的测试。
 *
 * 为什么存在：`scripts/check-motion-contract.mjs` 是动效契约的唯一执行者，而它的判据全是
 * 「声明里有没有」这类事实。这类检查最容易悄悄退化成恒真：正则写宽一点就永远命中、
 * `@media` 剥块写错就把兜底当成不存在、baseline 只许收缩的方向写反就永远绿。
 * 所以这里**在真实源码树上跑一次实测**（不是 fixture 自证），再用注入文件钉住每条失败态。
 *
 * 明确非目标：不判断动效好不好看（那需要拍帧人眼复核，MOTION.md「验证」一节写清了）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  analyzeSource,
  baselineKey,
  MAX_MOTION_MS,
  parseDurationMs,
  resolveDispositions,
  runCheck,
  stripReducedMotionBlocks,
  summarize,
  toBaselineMap,
} from '../../../check-motion-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

test('parseDurationMs reads ms and s, rejects anything else', () => {
  assert.equal(parseDurationMs('200ms'), 200);
  assert.equal(parseDurationMs('1.2s'), 1200);
  assert.equal(parseDurationMs('0.46s'), 460);
  assert.equal(parseDurationMs('0'), null);
  assert.equal(parseDurationMs('auto'), null);
});

test('stripReducedMotionBlocks removes the whole block, including nested braces', () => {
  const css = [
    '.a { transition: color 120ms; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .a { transition: none; }',
    '  @supports (x: y) { .b { animation: none; } }',
    '}',
    '.c { animation: spin 2s infinite; }',
  ].join('\n');
  const stripped = stripReducedMotionBlocks(css);
  assert.ok(!stripped.includes('prefers-reduced-motion'), 'the media block itself is gone');
  assert.ok(!stripped.includes('.b'), 'nested blocks inside it are gone too');
  assert.ok(stripped.includes('animation: spin 2s infinite'), 'rules after the block survive');
});

test('analyzeSource flags transition: all and over-ceiling durations', () => {
  // 中文注释：同文件里「transition: all」和「没有 reduced-motion 兜底」是两条独立事实，都要报。
  // 只报一条就等于用一条违规遮住另一条。
  const all = analyzeSource({ filePath: 'x.css', content: '.a { transition: all 200ms ease; }' });
  assert.deepEqual(all.findings.map((f) => f.code).sort(), ['motionWithoutReducedMotion', 'transitionAll']);

  // no-preference 分支是「有动效」那一支，必须被量到，不能被当成兜底整块剥掉。
  const slow = analyzeSource({
    filePath: 'x.css',
    content: `@media (prefers-reduced-motion: no-preference) { .a { transition: opacity ${MAX_MOTION_MS + 500}ms ease; } }`,
  });
  assert.deepEqual(slow.findings.map((f) => f.code), ['durationOverCeiling']);

  // 真兜底（reduce）里的规则不参与判定：否则 `transition: none` 也会被算成一条动效声明。
  const realFallback = analyzeSource({
    filePath: 'x.css',
    content: `.a { transition: opacity ${MAX_MOTION_MS + 500}ms ease; }\n@media (prefers-reduced-motion: reduce) { .a { transition: none; } }`,
  });
  assert.deepEqual(realFallback.findings.map((f) => f.code), ['durationOverCeiling']);
});

test('analyzeSource: a reduced-motion block clears the baseline finding but not other rules', () => {
  const withFallback = analyzeSource({
    filePath: 'x.css',
    content: '.a { animation: blink 1s steps(2) infinite; }\n@media (prefers-reduced-motion: reduce) { .a { animation: none; } }',
  });
  assert.equal(withFallback.hasReducedMotion, true);
  assert.deepEqual(withFallback.findings, [], 'infinite animation with a fallback is not a violation');

  const withoutFallback = analyzeSource({
    filePath: 'x.css',
    content: '.a { animation: blink 1s steps(2) infinite; }',
  });
  assert.deepEqual(withoutFallback.findings.map((f) => f.code), ['infiniteWithoutReducedMotion']);
});

test('analyzeSource: a non-infinite motion without fallback is still a violation', () => {
  const result = analyzeSource({ filePath: 'x.html', content: '<style>.a { transition: opacity 160ms; }</style>' });
  assert.deepEqual(result.findings.map((f) => f.code), ['motionWithoutReducedMotion']);
});

test('analyzeSource: an exemption must name a real code and carry a reason', () => {
  const withReason = analyzeSource({
    filePath: 'x.css',
    content: '/* motion-contract: allow transitionAll — the boot splash is a deliberate 2s logo reveal */\n.a { transition: all 2s; }',
  });
  assert.deepEqual(withReason.exemptions, [{ code: 'transitionAll', reason: 'the boot splash is a deliberate 2s logo reveal' }]);

  const withoutReason = analyzeSource({
    filePath: 'x.css',
    content: '/* motion-contract: allow transitionAll — */\n.a { transition: all 2s; }',
  });
  assert.deepEqual(withoutReason.exemptions, [], 'an empty reason is not an exemption');

  const unknownCode = analyzeSource({
    filePath: 'x.css',
    content: '/* motion-contract: allow motionIsNice — because I said so */\n.a { transition: all 2s; }',
  });
  assert.deepEqual(unknownCode.exemptions, [], 'a typo in the rule name must not silently exempt anything');

  // 分析层不应用豁免（那是处置层的事），但它必须把豁免解析出来供处置层用。
  const partial = analyzeSource({
    filePath: 'x.css',
    content: '/* motion-contract: allow transitionAll — legacy card */\n.a { transition: all 2s; animation: spin 3s infinite; }',
  });
  assert.deepEqual(partial.findings.map((f) => f.code).sort(), [
    'durationOverCeiling',
    'durationOverCeiling',
    'infiniteWithoutReducedMotion',
    'transitionAll',
  ]);
  assert.deepEqual(partial.exemptions, [{ code: 'transitionAll', reason: 'legacy card' }]);
});

test('resolveDispositions: an exemption covers only the code it names', () => {
  const analyzed = analyzeSource({
    filePath: 'x.css',
    content: '/* motion-contract: allow transitionAll — legacy card */\n.a { transition: all; animation: spin 3s infinite; }',
  });
  const rows = resolveDispositions({ results: [{ filePath: 'x.css', ...analyzed }], baseline: new Map() });
  const byCode = new Map(rows.map((row) => [row.code, row]));
  assert.equal(byCode.get('transitionAll').disposition, 'exempt', 'the named code is exempt');
  assert.equal(byCode.get('transitionAll').reason, 'legacy card', 'the reason is carried through for the report');
  assert.equal(byCode.get('infiniteWithoutReducedMotion').disposition, 'violation', 'an unrelated code is still red');
  assert.equal(byCode.get('durationOverCeiling').disposition, 'violation', 'an unrelated code is still red');
});

test('resolveDispositions: baseline covers stock, a new hit is a violation, and stale entries surface', () => {
  const results = [
    { filePath: 'a.css', findings: [{ code: 'transitionAll' }, { code: 'transitionAll' }], exemptions: [] },
  ];
  const baseline = toBaselineMap([{ path: 'a.css', code: 'transitionAll', count: 2 }, { path: 'b.css', code: 'transitionAll', count: 1 }]);
  const withStock = resolveDispositions({ results, baseline });
  const a = withStock.find((row) => row.path === 'a.css');
  assert.equal(a.disposition, 'baseline', 'count within the recorded stock is not a regression');

  // 存量增长 → 红灯（基线只许收缩，不是「有这个文件就放过」）。
  const grown = resolveDispositions({
    results: [{ filePath: 'a.css', findings: [{ code: 'transitionAll' }, { code: 'transitionAll' }, { code: 'transitionAll' }], exemptions: [] }],
    baseline,
  });
  assert.equal(grown.find((row) => row.path === 'a.css').disposition, 'violation');

  // baseline 里有、这次没命中 → stale（要求把基线收掉）。
  assert.ok(withStock.some((row) => row.disposition === 'baseline-stale' && row.path === 'b.css'));

  assert.equal(baselineKey('a.css', 'transitionAll'), 'a.css::transitionAll');
  assert.deepEqual(summarize(withStock), { measured: 2, exempt: 0, baseline: 1, baselineStale: 1, blocking: 0 });
});

test('the shipped contract says what the checker enforces', () => {
  const contract = fs.readFileSync(path.join(ROOT, 'MOTION.md'), 'utf8');
  assert.match(contract, /check-motion-contract\.mjs/u, 'MOTION.md must name its own executable gate');
  assert.match(contract, /prefers-reduced-motion/u);
  // 判据分层必须写在契约里，否则「机器能判」与「人眼看」会被后来者混成一层。
  assert.match(contract, /可机器判定/u);
  assert.match(contract, /需人眼判定/u);
});

test('skip is not a blanket excuse: a broken read still fails instead of reporting clean', () => {
  // 中文注释：上一条测试容忍了「不在 git work tree 里」这一种跳过。这条测试钉住它的边界：
  // 真正的故障（读文件抛 EACCES/其它错误）必须往上抛，不能被吸收成 skip 或干净结果。
  assert.throws(
    () => runCheck({
      rootDir: '/nonexistent-root-for-motion-test',
      files: ['a.css'],
      baselineEntries: [],
      readImpl: () => {
        const error = new Error('permission denied');
        error.code = 'EACCES';
        throw error;
      },
    }),
    /permission denied/u,
  );

  // ENOENT 是唯一可以跳过的读错误（tracked 但工作树里已删）。
  const missing = runCheck({
    rootDir: '/nonexistent-root-for-motion-test',
    files: ['gone.css'],
    baselineEntries: [],
    readImpl: () => {
      const error = new Error('gone');
      error.code = 'ENOENT';
      throw error;
    },
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.scanned, 0);
  assert.deepEqual(missing.summary, { measured: 0, exempt: 0, baseline: 0, baselineStale: 0, blocking: 0 });
});

test('the real repository: the checker runs and every finding has an executable disposition', () => {
  const result = runCheck({ rootDir: ROOT });
  assert.equal(result.ok, true);
  if (result.skip) {
    // 中文注释：这条断言最初的写法是「skip 必须为 false」，它在本仓通过、在**解包后的发布产物**
    // 里必然失败（那里不是 git work tree），于是验证断言本身成了装机用户的故障源。
    // 正确的不变式不是「不得 skip」，而是「如果 skip，理由必须是那一个已知理由」：
    // 这样真正的故障（发现逻辑崩了、readdir 挂了）仍然无法伪装成一次跳过。
    assert.match(result.reason, /not a git work tree/u, `skip must be the documented reason, got: ${result.reason}`);
    return;
  }
  assert.ok(result.scanned > 0, 'scanned=0 would mean the file discovery is broken, not that the repo is clean');
  for (const row of result.rows) {
    assert.ok(['violation', 'baseline', 'exempt', 'baseline-stale'].includes(row.disposition), `unknown disposition ${row.disposition}`);
    assert.ok(row.source.length > 0, `${row.path} [${row.code}] must cite the contract section it enforces`);
  }
});
