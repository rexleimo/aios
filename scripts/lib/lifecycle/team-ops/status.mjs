import { readHudState } from '../../hud/state.mjs';
import { normalizeHudPreset, renderHud } from '../../hud/render.mjs';
import {
  filterSkillCandidateState,
  formatSkillCandidateDetails,
} from '../../hud/skill-candidates.mjs';
import { buildWatchMeta } from '../../hud/watch-meta.mjs';
import { resolveWatchCadence } from '../../hud/watch-cadence.mjs';
import { createThrottledWatchRender, watchRenderLoop } from '../../hud/watch.mjs';
import { buildTeamWatchdogState } from '../watchdog.mjs';
import {
  DEFAULT_WATCH_STALLED_MS,
  FAST_WATCH_DATA_REFRESH_MS,
  createStatusWatchStallTracker,
  normalizeProvider,
  normalizeText,
  normalizeWatchStalledMs,
} from './shared.mjs';
import { persistSkillCandidatePatchTemplateArtifact } from './status-artifacts.mjs';
import { resolveStatusSkillCandidateOptions } from './status-options.mjs';

async function formatDeathNoticesLine(rootDir, sessionId) {
  const sid = normalizeText(sessionId);
  if (!rootDir || !sid) return '';
  try {
    const { readDeathNotices } = await import('../death-notice.mjs');
    const notices = await readDeathNotices(rootDir, sid);
    if (!notices.length) return '';
    const latest = notices[notices.length - 1];
    return `Death notices: count=${notices.length} latest=${latest.agent_id || '?'} reason=${latest.reason || '?'} at=${latest.timestamp || '?'}`;
  } catch {
    return '';
  }
}

// 纯函数：把 watchdog 状态压缩成 HUD 末尾的一行，避免状态命令关心 watchdog 内部结构。
function formatWatchdogStatusLine(state = {}) {
  const watchdog = state?.watchdog;
  if (!watchdog || typeof watchdog !== 'object') return '';
  const readiness = watchdog.readiness && typeof watchdog.readiness === 'object'
    ? watchdog.readiness
    : null;
  const readinessVerdict = normalizeText(readiness?.verdict);
  const readinessLabel = readinessVerdict ? ` readiness=${readinessVerdict}` : '';
  return `Watchdog: decision=${watchdog.decision}${readinessLabel} reason=${watchdog.reason}`;
}

export async function runTeamStatus(
  rawOptions = {},
  {
    rootDir,
    io = console,
    env = process.env,
    watchLoop = watchRenderLoop,
    nowFn = () => Date.now(),
  } = {}
) {
  const sessionId = normalizeText(rawOptions.sessionId || rawOptions.resumeSessionId);
  const provider = normalizeProvider(rawOptions.provider);
  const preset = normalizeHudPreset(rawOptions.preset || 'focused');
  let watch = rawOptions.watch === true;
  const fast = rawOptions.fast === true;
  const json = rawOptions.json === true;
  const includeWatchdog = rawOptions.watchdog === true;
  const watchCadence = resolveWatchCadence(rawOptions.intervalMs, { fallbackMs: 1000 });
  const intervalMs = watchCadence.renderIntervalMs;
  let fastWatchMinimal = fast && watch && !json && preset === 'minimal';
  let {
    showSkillCandidates,
    skillCandidateLimit,
    skillCandidateView,
    exportSkillCandidatePatchTemplate,
    draftId,
  } = resolveStatusSkillCandidateOptions({
    showSkillCandidates: rawOptions.showSkillCandidates === true,
    requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
    skillCandidateView: rawOptions.skillCandidateView,
    exportSkillCandidatePatchTemplate: rawOptions.exportSkillCandidatePatchTemplate === true,
    draftId: rawOptions.draftId,
    fastWatchMinimal,
  });
  if (watch && exportSkillCandidatePatchTemplate) {
    io.log('[warn] team status --watch is ignored when --export-skill-candidate-patch-template is set.');
    watch = false;
    fastWatchMinimal = false;
    ({
      showSkillCandidates,
      skillCandidateLimit,
      skillCandidateView,
      exportSkillCandidatePatchTemplate,
      draftId,
    } = resolveStatusSkillCandidateOptions({
      showSkillCandidates: rawOptions.showSkillCandidates === true,
      requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
      skillCandidateView: rawOptions.skillCandidateView,
      exportSkillCandidatePatchTemplate: rawOptions.exportSkillCandidatePatchTemplate === true,
      draftId: rawOptions.draftId,
      fastWatchMinimal,
    }));
  }
  const dataRefreshMs = fastWatchMinimal
    ? Math.max(intervalMs, FAST_WATCH_DATA_REFRESH_MS)
    : intervalMs;
  const dataRefreshLabel = watchCadence.adaptiveInterval
    ? fastWatchMinimal
      ? `auto(${dataRefreshMs}-${Math.max(dataRefreshMs, watchCadence.adaptiveInterval.maxIntervalMs)}ms)`
      : watchCadence.renderIntervalLabel
    : `${dataRefreshMs}ms`;
  const stalledThresholdMs = normalizeWatchStalledMs(env?.AIOS_WATCH_STALLED_MS, DEFAULT_WATCH_STALLED_MS);
  const stallTracker = watch
    ? createStatusWatchStallTracker({ thresholdMs: stalledThresholdMs, nowFn })
    : null;

  const renderOnce = async () => {
    const state = await readHudState({
      rootDir,
      sessionId,
      provider,
      fast: fastWatchMinimal,
      skillCandidateLimit,
      watchdog: includeWatchdog,
      nowMs: Number(nowFn()),
    });
    const filteredState = filterSkillCandidateState(state, { draftId });
    if (includeWatchdog && !filteredState.watchdog) {
      filteredState.watchdog = await buildTeamWatchdogState(
        { sessionId: filteredState.selection?.sessionId || sessionId, provider },
        { rootDir, nowFn }
      );
    }
    if (json) {
      if (exportSkillCandidatePatchTemplate) {
        io.log('[warn] team status --export-skill-candidate-patch-template is ignored when --json is set.');
      }
      io.log(JSON.stringify(filteredState, null, 2));
      return { exitCode: filteredState.selection?.sessionId ? 0 : 1 };
    }

    const hudText = renderHud(filteredState, {
      preset,
      watchMeta: watch
        ? buildWatchMeta(filteredState, {
          renderIntervalMs: intervalMs,
          renderIntervalLabel: watchCadence.renderIntervalLabel,
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
    if (includeWatchdog) {
      outputBlocks.push(formatWatchdogStatusLine(filteredState));
    }

    // A3: surface worker_died notices for the selected session
    const deathLine = await formatDeathNoticesLine(
      rootDir,
      filteredState.selection?.sessionId || sessionId,
    );
    if (deathLine) outputBlocks.push(deathLine);

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
    return { exitCode: filteredState.selection?.sessionId ? 0 : 1 };
  };

  if (!watch || json) {
    if (watch && json) {
      io.log('[warn] team status --watch is ignored when --json is set.');
    }
    return await renderOnce();
  }

  const readAndRender = async () => {
    const rawNow = Number(nowFn());
    const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now();
    const state = await readHudState({
      rootDir,
      sessionId,
      provider,
      fast: fastWatchMinimal,
      skillCandidateLimit,
      watchdog: includeWatchdog,
      nowMs,
    });
    const filteredState = filterSkillCandidateState(state, { draftId });
    const stalledSignal = stallTracker?.observe(filteredState, { nowMs }) || null;
    const watchMeta = {
      ...buildWatchMeta(filteredState, {
        renderIntervalMs: intervalMs,
        renderIntervalLabel: watchCadence.renderIntervalLabel,
        dataRefreshMs,
        dataRefreshLabel,
        fast: fastWatchMinimal,
        nowMs,
      }),
      ...(stalledSignal ? stalledSignal : {}),
    };
    const hudText = renderHud(filteredState, {
      preset,
      watchMeta,
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
    if (includeWatchdog) {
      outputBlocks.push(formatWatchdogStatusLine(filteredState));
    }
    return outputBlocks.filter(Boolean).join('\n') + '\n';
  };

  const watchRender = fastWatchMinimal
    ? createThrottledWatchRender(readAndRender, {
      minIntervalMs: dataRefreshMs,
    })
    : readAndRender;

  await watchLoop(watchRender, {
    intervalMs,
    adaptiveInterval: watchCadence.adaptiveInterval,
    env,
  });

  return { exitCode: process.exitCode ?? 0 };
}
