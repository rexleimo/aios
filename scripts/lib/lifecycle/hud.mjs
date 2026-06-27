import { promises as fs } from 'node:fs';
import path from 'node:path';

import { readHudState } from '../hud/state.mjs';
import { normalizeHudPreset, renderHud } from '../hud/render.mjs';
import {
  filterSkillCandidateState,
  formatSkillCandidateDetails,
  formatSkillCandidatePatchTemplateDocument,
} from '../hud/skill-candidates.mjs';
import { buildWatchMeta } from '../hud/watch-meta.mjs';
import { resolveWatchCadence } from '../hud/watch-cadence.mjs';
import { createThrottledWatchRender, watchRenderLoop } from '../hud/watch.mjs';

const FAST_WATCH_DATA_REFRESH_MS = 1000;
const DEFAULT_SKILL_CANDIDATE_LIMIT = 6;
const FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT = 3;
const MAX_SKILL_CANDIDATE_LIMIT = 20;
const SKILL_CANDIDATE_VIEWS = new Set(['inline', 'detail']);

import { normalizeText } from '../../../src/shared/normalize.mjs';

function normalizeSkillCandidateView(value, fallback = 'inline') {
  const normalized = normalizeText(value).toLowerCase();
  if (SKILL_CANDIDATE_VIEWS.has(normalized)) return normalized;
  if (normalized === 'list') return 'detail';
  return fallback;
}

function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function resolveHudSkillCandidateOptions({
  showSkillCandidates = false,
  requestedSkillCandidateLimit = 0,
  skillCandidateView = 'inline',
  exportSkillCandidatePatchTemplate = false,
  draftId = '',
  fastWatchMinimal = false,
} = {}) {
  const requestedLimit = Number.isFinite(requestedSkillCandidateLimit)
    ? Math.max(0, Math.floor(requestedSkillCandidateLimit))
    : 0;
  const normalizedDraftId = normalizeText(draftId);
  const shouldExportPatchTemplate = exportSkillCandidatePatchTemplate === true;
  const shouldShowSkillCandidates = showSkillCandidates === true || requestedLimit > 0 || shouldExportPatchTemplate || Boolean(normalizedDraftId);
  const boundedRequestedLimit = Math.min(MAX_SKILL_CANDIDATE_LIMIT, requestedLimit);
  const defaultLimit = fastWatchMinimal
    ? FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT
    : DEFAULT_SKILL_CANDIDATE_LIMIT;
  const skillCandidateLimit = shouldShowSkillCandidates
    ? Math.max(1, boundedRequestedLimit || defaultLimit)
    : 0;
  const resolvedSkillCandidateView = shouldShowSkillCandidates
    ? normalizeSkillCandidateView(skillCandidateView, 'inline')
    : 'inline';

  return {
    showSkillCandidates: shouldShowSkillCandidates,
    skillCandidateLimit,
    skillCandidateView: resolvedSkillCandidateView,
    exportSkillCandidatePatchTemplate: shouldExportPatchTemplate && shouldShowSkillCandidates,
    draftId: normalizedDraftId,
  };
}

function buildSkillCandidatePatchTemplateArtifactPath(sessionId, { stamp = '' } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedStamp = normalizeText(stamp) || formatArtifactTimestamp();
  return path.join(
    'memory',
    'context-db',
    'sessions',
    normalizedSessionId,
    'artifacts',
    `skill-candidate-patch-template-${normalizedStamp}.md`
  );
}

async function persistSkillCandidatePatchTemplateArtifact({
  rootDir,
  state,
  skillCandidateLimit = DEFAULT_SKILL_CANDIDATE_LIMIT,
  draftId = '',
} = {}) {
  const sessionId = normalizeText(state?.selection?.sessionId) || normalizeText(state?.session?.sessionId);
  if (!sessionId) return null;

  const generatedAt = new Date().toISOString();
  const artifactPath = buildSkillCandidatePatchTemplateArtifactPath(sessionId, {
    stamp: formatArtifactTimestamp(new Date(generatedAt)),
  });
  const artifactAbsPath = path.join(rootDir, artifactPath);
  const content = formatSkillCandidatePatchTemplateDocument(state, {
    rootDir,
    limit: skillCandidateLimit,
    generatedAt,
    draftId,
  });

  await fs.mkdir(path.dirname(artifactAbsPath), { recursive: true });
  await fs.writeFile(artifactAbsPath, `${content}\n`, 'utf8');

  return {
    artifactPath: toPosixPath(artifactPath),
    generatedAt,
  };
}

export function normalizeHudOptions(rawOptions = {}) {
  const cadence = resolveWatchCadence(rawOptions.intervalMs, { fallbackMs: 1000 });
  const requestedSkillCandidateLimit = Number.isFinite(rawOptions.skillCandidateLimit)
    ? Math.max(0, Math.floor(rawOptions.skillCandidateLimit))
    : 0;
  return {
    sessionId: normalizeText(rawOptions.sessionId),
    provider: normalizeText(rawOptions.provider).toLowerCase(),
    preset: normalizeHudPreset(rawOptions.preset || 'focused'),
    watch: rawOptions.watch === true,
    fast: rawOptions.fast === true,
    showSkillCandidates: rawOptions.showSkillCandidates === true,
    skillCandidateView: normalizeSkillCandidateView(rawOptions.skillCandidateView || 'inline'),
    skillCandidateLimit: requestedSkillCandidateLimit,
    exportSkillCandidatePatchTemplate: rawOptions.exportSkillCandidatePatchTemplate === true,
    draftId: normalizeText(rawOptions.draftId),
    watchdog: rawOptions.watchdog === true,
    json: rawOptions.json === true,
    intervalMs: cadence.renderIntervalMs,
    intervalLabel: cadence.renderIntervalLabel,
    adaptiveInterval: cadence.adaptiveInterval,
  };
}

export async function runHud(rawOptions = {}, { rootDir, io = console, env = process.env } = {}) {
  const options = normalizeHudOptions(rawOptions);
  let watch = options.watch;
  let fastWatchMinimal = options.fast && watch && !options.json && options.preset === 'minimal';
  let {
    showSkillCandidates,
    skillCandidateLimit,
    skillCandidateView,
    exportSkillCandidatePatchTemplate,
    draftId,
  } = resolveHudSkillCandidateOptions({
    showSkillCandidates: options.showSkillCandidates,
    requestedSkillCandidateLimit: options.skillCandidateLimit,
    skillCandidateView: options.skillCandidateView,
    exportSkillCandidatePatchTemplate: options.exportSkillCandidatePatchTemplate,
    draftId: options.draftId,
    fastWatchMinimal,
  });
  if (watch && exportSkillCandidatePatchTemplate) {
    io.log('[warn] hud --watch is ignored when --export-skill-candidate-patch-template is set.');
    watch = false;
    fastWatchMinimal = false;
    ({
      showSkillCandidates,
      skillCandidateLimit,
      skillCandidateView,
      exportSkillCandidatePatchTemplate,
      draftId,
    } = resolveHudSkillCandidateOptions({
      showSkillCandidates: options.showSkillCandidates,
      requestedSkillCandidateLimit: options.skillCandidateLimit,
      skillCandidateView: options.skillCandidateView,
      exportSkillCandidatePatchTemplate: options.exportSkillCandidatePatchTemplate,
      draftId: options.draftId,
      fastWatchMinimal,
    }));
  }
  const dataRefreshMs = fastWatchMinimal
    ? Math.max(options.intervalMs, FAST_WATCH_DATA_REFRESH_MS)
    : options.intervalMs;
  const dataRefreshLabel = options.adaptiveInterval
    ? fastWatchMinimal
      ? `auto(${dataRefreshMs}-${Math.max(dataRefreshMs, options.adaptiveInterval.maxIntervalMs)}ms)`
      : options.intervalLabel
    : `${dataRefreshMs}ms`;

  const renderOnce = async () => {
    const state = await readHudState({
      rootDir,
      sessionId: options.sessionId,
      provider: options.provider,
      fast: fastWatchMinimal,
      skillCandidateLimit,
      watchdog: options.watchdog,
    });
    const filteredState = filterSkillCandidateState(state, { draftId });

    if (options.json) {
      if (exportSkillCandidatePatchTemplate) {
        io.log('[warn] hud --export-skill-candidate-patch-template is ignored when --json is set.');
      }
      io.log(JSON.stringify(filteredState, null, 2));
      return { exitCode: filteredState.selection?.sessionId ? 0 : 1, state: filteredState };
    }

    const hudText = renderHud(filteredState, {
      preset: options.preset,
      watchMeta: watch
        ? buildWatchMeta(filteredState, {
          renderIntervalMs: options.intervalMs,
          renderIntervalLabel: options.intervalLabel,
          dataRefreshMs,
          dataRefreshLabel,
          fast: fastWatchMinimal,
        })
        : null,
    }).trimEnd();
    const skillCandidateText = showSkillCandidates
      ? formatSkillCandidateDetails(filteredState, {
        limit: skillCandidateLimit,
        standalone: skillCandidateView === 'detail',
      })
      : '';
    const outputBlocks = skillCandidateView === 'detail'
      ? [skillCandidateText]
      : [hudText, skillCandidateText];

    if (exportSkillCandidatePatchTemplate) {
      const artifact = await persistSkillCandidatePatchTemplateArtifact({
        rootDir,
        state: filteredState,
        skillCandidateLimit,
        draftId,
      });
      if (artifact?.artifactPath) {
        outputBlocks.push(`Skill candidate patch template artifact: ${artifact.artifactPath}`);
      } else {
        outputBlocks.push('Skill candidate patch template export skipped: no session selected.');
      }
    }

    io.log(outputBlocks.filter(Boolean).join('\n') + '\n');
    return { exitCode: filteredState.selection?.sessionId ? 0 : 1, state: filteredState };
  };

  if (!watch || options.json) {
    if (watch && options.json) {
      io.log('[warn] hud --watch is ignored when --json is set.');
    }
    return await renderOnce();
  }

  const readAndRender = async () => {
    const state = await readHudState({
      rootDir,
      sessionId: options.sessionId,
      provider: options.provider,
      fast: fastWatchMinimal,
      skillCandidateLimit,
      watchdog: options.watchdog,
    });
    const filteredState = filterSkillCandidateState(state, { draftId });
    const hudText = renderHud(filteredState, {
      preset: options.preset,
      watchMeta: buildWatchMeta(filteredState, {
        renderIntervalMs: options.intervalMs,
        renderIntervalLabel: options.intervalLabel,
        dataRefreshMs,
        dataRefreshLabel,
        fast: fastWatchMinimal,
      }),
    }).trimEnd();
    const skillCandidateText = showSkillCandidates
      ? formatSkillCandidateDetails(filteredState, {
        limit: skillCandidateLimit,
        standalone: skillCandidateView === 'detail',
      })
      : '';
    const outputBlocks = skillCandidateView === 'detail'
      ? [skillCandidateText]
      : [hudText, skillCandidateText];
    return outputBlocks.filter(Boolean).join('\n') + '\n';
  };

  const watchRender = fastWatchMinimal
    ? createThrottledWatchRender(readAndRender, {
      minIntervalMs: dataRefreshMs,
    })
    : readAndRender;

  await watchRenderLoop(watchRender, {
    intervalMs: options.intervalMs,
    adaptiveInterval: options.adaptiveInterval,
    env,
  });

  return { exitCode: process.exitCode ?? 0 };
}
