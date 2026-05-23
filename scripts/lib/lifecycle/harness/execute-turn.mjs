import path from 'node:path';
import { spawnCommand } from '../../platform/process.mjs';
import { buildSoloHarnessCommand } from '../../harness/solo-profiles.mjs';
import { classifySoloFailure } from '../../harness/solo-runtime.mjs';
import { normalizeText } from './shared.mjs';
import { buildIterationPrompt, parseHarnessJsonOutput } from './prompt.mjs';

export function buildProductionExecuteTurn({ rootDir, aiosRootDir = '', sessionId, objective, provider } = {}) {
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));
  return async ({ iteration, continuity, offloadCanvas, summary, worktree }) => {
    const prompt = buildIterationPrompt({
      objective,
      iteration,
      continuity,
      offloadCanvas,
      summary,
    });
    const workspaceRoot = worktree?.enabled && worktree?.path ? worktree.path : rootDir;
    const built = buildSoloHarnessCommand({
      rootDir: summary?.workspaceRoot || rootDir,
      aiosRootDir: summary?.aiosRootDir || runtimeAiosRootDir,
      sessionId,
      objective,
      provider,
      workspaceRoot,
      prompt,
    });
    const result = await spawnCommand(built.command, built.args, {
      cwd: built.cwd,
      env: process.env,
      timeoutMs: 30 * 60 * 1000,
    });
    const rawOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const parsed = parseHarnessJsonOutput(rawOutput);

    if (result.timedOut) {
      return {
        prompt,
        rawOutput,
        outcome: 'infra-retry',
        summary: 'Provider timed out before returning a valid iteration payload.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'Retry after backoff.',
        shouldStop: false,
        failureClass: 'runtime-error',
      };
    }

    if (result.error) {
      return {
        prompt,
        rawOutput,
        outcome: 'infra-retry',
        summary: result.error.message || 'Provider execution failed.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'Retry after backoff.',
        shouldStop: false,
        failureClass: classifySoloFailure(result.error),
      };
    }

    if (parsed && typeof parsed === 'object') {
      return {
        prompt,
        rawOutput,
        ...parsed,
      };
    }

    if ((result.status ?? 1) !== 0) {
      const failureClass = classifySoloFailure(rawOutput);
      const humanGate = failureClass === 'ownership-gate' || failureClass === 'safety-gate';
      return {
        prompt,
        rawOutput,
        outcome: humanGate ? 'human-gate' : 'infra-retry',
        summary: normalizeText(rawOutput, 'Provider returned a non-zero exit code.'),
        keyChanges: [],
        keyLearnings: [],
        nextAction: humanGate ? 'Review the provider failure and resume manually.' : 'Retry after backoff.',
        shouldStop: humanGate,
        failureClass,
      };
    }

    return {
      prompt,
      rawOutput,
      outcome: 'infra-retry',
      summary: 'Provider output did not include a valid JSON payload for the iteration contract.',
      keyChanges: [],
      keyLearnings: [],
      nextAction: 'Retry with stricter output formatting.',
      shouldStop: false,
      failureClass: 'runtime-error',
    };
  };
}
