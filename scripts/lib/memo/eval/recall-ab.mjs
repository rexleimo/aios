// Deterministic A/B ablation for the bi-temporal recall path.
//
// This does not call a model. It seeds a memo corpus whose ground truth is
// known — each fact chain has exactly one currently-true revision — and then
// runs the real `searchMemoEvents` under three arms:
//
//   baseline          corpus with no supersede links (pre-F12 behaviour)
//   temporal-explicit links authored on write (the ceiling F12 can reach)
//   temporal-auto     links derived by `memo supersede` at its default
//                     threshold (what you actually get with no manual effort)
//
// The gap between the last two is the honest cost of relying on automatic
// detection instead of asking the writer to declare what a fact replaces.

import { appendMemoEvent, writeExistingEvents } from '../storage/events-write.mjs';
import { searchMemoEvents } from '../storage/query.mjs';
import { proposeSupersedes, DEFAULT_SUPERSEDE_THRESHOLD } from '../storage/temporal.mjs';

const BASE_TS = Date.parse('2026-01-01T00:00:00.000Z');
const TS_STEP_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;

export const ARMS = ['baseline', 'temporal-explicit', 'temporal-auto'];

// Segments exist so the report can separate "where this works" from "where it
// does not". A single blended average would hide both.
export const EVAL_CHAINS = [
  // ── reword: later revision restates the same fact, high word overlap ──
  {
    id: 'pkg-manager',
    segment: 'reword',
    query: 'pkg-manager',
    revisions: [
      { text: 'pkg-manager the project uses pnpm as the package manager for all workspaces' },
      { text: 'pkg-manager the project uses npm as the package manager for all workspaces' },
    ],
  },
  {
    id: 'deploy-region',
    segment: 'reword',
    query: 'deploy-region',
    revisions: [
      { text: 'deploy-region the primary deployment region for the api tier is us-east-1' },
      { text: 'deploy-region the primary deployment region for the api tier is eu-west-1' },
      { text: 'deploy-region the primary deployment region for the api tier is ap-south-1' },
    ],
  },
  {
    id: 'node-version',
    segment: 'reword',
    query: 'node-version',
    revisions: [
      { text: 'node-version the supported runtime baseline for this repository is node 20' },
      { text: 'node-version the supported runtime baseline for this repository is node 22' },
    ],
  },
  {
    id: 'review-owner',
    segment: 'reword',
    query: 'review-owner',
    revisions: [
      { text: 'review-owner the default reviewer for release branches is the platform team' },
      { text: 'review-owner the default reviewer for release branches is the runtime team' },
    ],
  },

  // ── flip: the decision is reversed and reworded, low word overlap ──
  {
    id: 'cache-layer',
    segment: 'flip',
    query: 'cache-layer',
    revisions: [
      { text: 'cache-layer redis backs every session lookup in production traffic' },
      { text: 'cache-layer dropped redis, sessions now live in postgres row storage' },
    ],
  },
  {
    id: 'auth-mode',
    segment: 'flip',
    query: 'auth-mode',
    revisions: [
      { text: 'auth-mode browser automation reuses a long lived cookie jar per profile' },
      { text: 'auth-mode每次都要人工完成登录墙，禁止复用凭据缓存' },
    ],
  },
  {
    id: 'release-gate',
    segment: 'flip',
    query: 'release-gate',
    revisions: [
      { text: 'release-gate publishing requires two approvals from the maintainer group' },
      { text: 'release-gate a single signed tag now unblocks publish, approvals retired' },
    ],
  },
  {
    id: 'browser-mcp',
    segment: 'flip',
    query: 'browser-mcp',
    revisions: [
      { text: 'browser-mcp chrome-devtools is the default surface for page interaction' },
      { text: 'browser-mcp route everything through browser-use over cdp instead' },
    ],
  },

  // ── ranked-stale: the retired note is better indexed than its replacement ──
  // Its query term appears in both text and refs, so `scoreEvent` ranks it
  // above the newer entry. This is the case where hiding it changes top-1.
  {
    id: 'lint-rule',
    segment: 'ranked-stale',
    query: 'lint-rule',
    revisions: [
      { text: 'lint-rule the repository enforces no-unused-vars as an error', refs: ['#lint-rule'] },
      { text: 'lint-rule the repository downgrades no-unused-vars to a warning' },
    ],
  },
  {
    id: 'test-runner',
    segment: 'ranked-stale',
    query: 'test-runner',
    revisions: [
      { text: 'test-runner suites execute through the vitest workspace runner', refs: ['#test-runner'] },
      { text: 'test-runner suites execute through the node test runner instead' },
    ],
  },
  {
    id: 'state-root',
    segment: 'ranked-stale',
    query: 'state-root',
    revisions: [
      { text: 'state-root project state is written under a dot-aios directory', refs: ['#state-root'] },
      { text: 'state-root project state moved to the workspace scoped store' },
    ],
  },

  // ── cjk: Chinese memos, no whitespace between words ──
  // `textSimilarity` splits on whitespace, so these are here to measure what
  // the automatic detector does with the language this project writes in.
  {
    id: 'cjk-package',
    segment: 'cjk',
    query: 'cjk-package',
    revisions: [
      { text: 'cjk-package 项目使用 pnpm 作为包管理器，锁文件提交到仓库' },
      { text: 'cjk-package 项目使用 npm 作为包管理器，锁文件提交到仓库' },
    ],
  },
  {
    id: 'cjk-region',
    segment: 'cjk',
    query: 'cjk-region',
    revisions: [
      { text: 'cjk-region 生产环境部署在华东二区，灰度先走单可用区' },
      { text: 'cjk-region 生产环境部署在华北三区，灰度先走单可用区' },
    ],
  },
];

// Unrelated entries so recall has something to be wrong about.
const NOISE_TEXTS = [
  'onboarding new contributors should read the architecture overview first',
  'incident 2410 was caused by a stale dns record in the edge tier',
  'the design tokens live in a separate package and ship on their own cadence',
  'quarterly dependency audit is scheduled for the first week of each quarter',
  'support rotation handovers happen on tuesday mornings',
  'the changelog is generated from conventional commit subjects',
];

function chainEventId(chainId, index) {
  return `eval:${chainId}:${index}`;
}

export function currentTextOf(chain) {
  return chain.revisions[chain.revisions.length - 1].text;
}

export function staleTextsOf(chain) {
  return chain.revisions.slice(0, -1).map((revision) => revision.text);
}

// `withLinks` is the only difference between the baseline corpus and the
// explicit-link corpus, so any metric delta is attributable to the links.
export function buildCorpusEvents({ withLinks = false, chains = EVAL_CHAINS } = {}) {
  const events = [];
  let tick = 0;
  const nextTs = () => new Date(BASE_TS + (tick++) * TS_STEP_MS).toISOString();

  for (const chain of chains) {
    chain.revisions.forEach((revision, index) => {
      const ts = nextTs();
      events.push({
        eventId: chainEventId(chain.id, index),
        space: 'default',
        text: revision.text,
        refs: revision.refs || [],
        ts,
        validAt: ts,
        scope: 'project_shared',
        agent: '',
        ...(withLinks && index > 0 ? { supersedes: [chainEventId(chain.id, index - 1)] } : {}),
      });
    });
  }

  for (const [index, text] of NOISE_TEXTS.entries()) {
    const ts = nextTs();
    events.push({
      eventId: `eval:noise:${index}`,
      space: 'default',
      text,
      refs: [],
      ts,
      validAt: ts,
      scope: 'project_shared',
      agent: '',
    });
  }

  return events;
}

export async function seedCorpus(workspaceRoot, { storage = 'file', withLinks = false, chains = EVAL_CHAINS } = {}) {
  await writeExistingEvents(workspaceRoot, storage, buildCorpusEvents({ withLinks, chains }));
}

// Mirrors what `memo supersede --apply` writes: a re-assertion of the winning
// text that retires every revision it replaces, including the winner's own
// earlier copy.
export async function applyAutoSupersedes(workspaceRoot, { storage = 'file', threshold = DEFAULT_SUPERSEDE_THRESHOLD } = {}) {
  const events = await searchMemoEvents(workspaceRoot, { storage, space: 'default', query: '', limit: 5000 });
  const proposals = proposeSupersedes(events, { threshold });
  for (const proposal of proposals) {
    await appendMemoEvent({
      workspaceRoot,
      storage,
      space: 'default',
      text: proposal.keep.text,
      supersedes: [proposal.keep.eventId, ...proposal.supersedes.map((target) => target.eventId)],
    });
  }
  return proposals.length;
}

function emptyTally() {
  return { queries: 0, top1Correct: 0, contradictions: 0, returned: 0, stale: 0, chars: 0 };
}

function addToTally(tally, sample) {
  tally.queries += 1;
  tally.top1Correct += sample.top1Correct ? 1 : 0;
  tally.contradictions += sample.contradiction ? 1 : 0;
  tally.returned += sample.returned;
  tally.stale += sample.stale;
  tally.chars += sample.chars;
  return tally;
}

function summarize(tally) {
  const { queries, returned } = tally;
  return {
    queries,
    top1Accuracy: queries === 0 ? 0 : tally.top1Correct / queries,
    contradictionRate: queries === 0 ? 0 : tally.contradictions / queries,
    staleRate: returned === 0 ? 0 : tally.stale / returned,
    avgReturned: queries === 0 ? 0 : returned / queries,
    avgChars: queries === 0 ? 0 : tally.chars / queries,
  };
}

export async function measureArm(workspaceRoot, { storage = 'file', chains = EVAL_CHAINS, limit = DEFAULT_LIMIT } = {}) {
  const overall = emptyTally();
  const bySegment = new Map();
  const perChain = [];

  for (const chain of chains) {
    const results = await searchMemoEvents(workspaceRoot, {
      storage,
      space: 'default',
      query: chain.query,
      limit,
    });

    const currentText = currentTextOf(chain);
    const staleTexts = new Set(staleTextsOf(chain));
    const stale = results.filter((event) => staleTexts.has(event.text)).length;
    const current = results.filter((event) => event.text === currentText).length;

    const sample = {
      chain: chain.id,
      segment: chain.segment,
      returned: results.length,
      stale,
      // A contradiction is a recall payload that hands the agent both the
      // retired fact and the one that replaced it, with nothing marking which
      // is which.
      contradiction: stale > 0 && current > 0,
      top1Correct: results[0]?.text === currentText,
      chars: results.reduce((total, event) => total + String(event.text || '').length, 0),
    };

    perChain.push(sample);
    addToTally(overall, sample);
    if (!bySegment.has(chain.segment)) bySegment.set(chain.segment, emptyTally());
    addToTally(bySegment.get(chain.segment), sample);
  }

  return {
    overall: summarize(overall),
    bySegment: Object.fromEntries([...bySegment].map(([name, tally]) => [name, summarize(tally)])),
    perChain,
  };
}

export async function runArm(workspaceRoot, arm, { storage = 'file', chains = EVAL_CHAINS, limit = DEFAULT_LIMIT, threshold = DEFAULT_SUPERSEDE_THRESHOLD } = {}) {
  if (!ARMS.includes(arm)) throw new Error(`unknown arm: ${arm}`);

  await seedCorpus(workspaceRoot, { storage, withLinks: arm === 'temporal-explicit', chains });

  let autoProposals = 0;
  if (arm === 'temporal-auto') {
    autoProposals = await applyAutoSupersedes(workspaceRoot, { storage, threshold });
  }

  const measured = await measureArm(workspaceRoot, { storage, chains, limit });
  return { arm, autoProposals, ...measured };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatReport(results) {
  const lines = [];
  lines.push('| arm | top-1 correct | contradiction rate | stale share of payload | avg entries | avg chars |');
  lines.push('|---|---|---|---|---|---|');
  for (const result of results) {
    const o = result.overall;
    lines.push(`| ${result.arm} | ${percent(o.top1Accuracy)} | ${percent(o.contradictionRate)} | ${percent(o.staleRate)} | ${o.avgReturned.toFixed(2)} | ${o.avgChars.toFixed(0)} |`);
  }

  const segments = [...new Set(results.flatMap((result) => Object.keys(result.bySegment)))];
  lines.push('');
  lines.push('| segment | arm | top-1 correct | contradiction rate | stale share |');
  lines.push('|---|---|---|---|---|');
  for (const segment of segments) {
    for (const result of results) {
      const s = result.bySegment[segment];
      if (!s) continue;
      lines.push(`| ${segment} | ${result.arm} | ${percent(s.top1Accuracy)} | ${percent(s.contradictionRate)} | ${percent(s.staleRate)} |`);
    }
  }

  const auto = results.find((result) => result.arm === 'temporal-auto');
  if (auto) {
    lines.push('');
    lines.push(`automatic detector produced ${auto.autoProposals} supersede proposal(s) across ${EVAL_CHAINS.length} fact chains.`);
  }
  return lines.join('\n');
}
