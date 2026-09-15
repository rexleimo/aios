// scripts/lib/tui-ink/screens/ConfirmScreen.tsx
import React from 'react';

import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Box, Text, useInput } from 'ink';
import { ConfirmInput } from '@inkjs/ui';
import { Header } from '../components/Header';
import { getNativePreview } from '../native-preview';
import type { Action, AllOptions, Client } from '../types';

interface ConfirmScreenProps {
  rootDir: string;
  options: AllOptions;
  onRun: (action: Action, actionOptions: unknown, hooks?: { onLog?: (line: string) => void }) => Promise<void>;
}

function formatComponents(components: Record<string, boolean>): string {
  return Object.entries(components)
    .filter(([, selected]) => selected)
    .map(([name]) => name)
    .join(', ') || '<none>';
}

function formatSkills(skills: string[]): string {
  return skills.length <= 3
    ? skills.join(', ') || '<none>'
    : `${skills.length} selected`;
}

function parseRepairId(line: string): string {
  const match = line.match(/^\[repair\] id=(.+)$/u);
  return match ? match[1].trim() : '';
}

function parseRepairSummary(line: string): string {
  const match = line.match(/^\[repair\] summary changed=(\d+) added=(\d+) updated=(\d+) removed=(\d+)$/u);
  if (!match) {
    return '';
  }
  return `changed=${match[1]} added=${match[2]} updated=${match[3]} removed=${match[4]}`;
}

function parseRepairRollback(line: string): string {
  const match = line.match(/^\[repair\] rollback:\s+(.+)$/u);
  return match ? match[1].trim() : '';
}

function normalizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('[repair] no repair history found')) {
    return 'No repair history found. Run doctor --native --fix first.';
  }
  return message;
}

export function ConfirmScreen({ rootDir, options, onRun }: ConfirmScreenProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action') as Action | null;

  const [status, setStatus] = useState<'confirming' | 'running' | 'done' | 'error'>('confirming');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [repairId, setRepairId] = useState('');
  const [repairSummary, setRepairSummary] = useState('');
  const [repairRollback, setRepairRollback] = useState('');
  const [runLabel, setRunLabel] = useState('');
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackResult, setRollbackResult] = useState<{
    level: 'ok' | 'warn' | 'error';
    message: string;
  } | null>(null);

  if (!action) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: missing action parameter</Text>
      </Box>
    );
  }

  const actionOptions = options[action];
  const nativeEnabled = Boolean(
    actionOptions
      && 'components' in actionOptions
      && (actionOptions.components as Record<string, boolean>).native
  );
  const nativeClient = (
    actionOptions && 'client' in actionOptions
      ? actionOptions.client
      : 'all'
  ) as Client;
  const nativePreview = nativeEnabled ? getNativePreview(nativeClient) : null;
  const canRollbackFromDone = action === 'doctor' && options.doctor.fix && !options.doctor.dryRun;
  const rollbackTargetId = repairId || 'latest';

  const appendLogLine = useCallback((line: string) => {
    const normalized = String(line || '').trim();
    if (!normalized) return;
    const maybeRepairId = parseRepairId(normalized);
    if (maybeRepairId) {
      setRepairId(maybeRepairId);
    }
    const maybeSummary = parseRepairSummary(normalized);
    if (maybeSummary) {
      setRepairSummary(maybeSummary);
    }
    const maybeRollback = parseRepairRollback(normalized);
    if (maybeRollback) {
      setRepairRollback(maybeRollback);
    }
    setLogLines((prev) => [...prev, normalized].slice(-20));
  }, []);

  const handleConfirm = async () => {
    setRunLabel(`Running ${action}...`);
    setStatus('running');
    setErrorMessage(null);
    setLogLines([]);
    setRepairId('');
    setRepairSummary('');
    setRepairRollback('');
    setRollbackResult(null);
    try {
      await onRun(action, actionOptions, {
        onLog: appendLogLine,
      });
      setStatus('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleRollback = useCallback(async () => {
    if (!canRollbackFromDone || rollbackBusy) {
      return;
    }

    setRollbackBusy(true);
    setRunLabel('Rolling back native repair...');
    setStatus('running');
    setLogLines([]);
    setRollbackResult(null);
    setErrorMessage(null);

    const emit = (prefix: string, args: unknown[]) => {
      const text = args.map((item) => String(item ?? '')).join(' ').trim();
      if (!text) return;
      appendLogLine(prefix ? `${prefix}${text}` : text);
    };
    const io = {
      log: (...args: unknown[]) => emit('', args),
      warn: (...args: unknown[]) => emit('[warn] ', args),
      error: (...args: unknown[]) => emit('[err] ', args),
    };

    try {
      const nativeModule = await import('../../components/native.mjs');
      await nativeModule.rollbackNativeEnhancements({
        rootDir,
        repairId: rollbackTargetId,
        dryRun: false,
        io,
      });
      const verify = await nativeModule.doctorNativeEnhancements({
        rootDir,
        client: 'all',
        verbose: false,
        fix: false,
        dryRun: false,
        io,
      });
      if (verify.ok) {
        setRollbackResult({
          level: 'ok',
          message: 'Rollback applied. Native doctor is clean.',
        });
      } else {
        setRollbackResult({
          level: 'warn',
          message: `Rollback applied, but native doctor still reports issues (warnings=${verify.effectiveWarnings}, errors=${verify.errors}).`,
        });
      }
      setStatus('done');
    } catch (error) {
      setRollbackResult({
        level: 'error',
        message: normalizeErrorMessage(error),
      });
      setStatus('done');
    } finally {
      setRollbackBusy(false);
    }
  }, [appendLogLine, canRollbackFromDone, rollbackBusy, rollbackTargetId, rootDir]);

  useInput((input) => {
    if (status !== 'done') {
      return;
    }
    if ((input === 'r' || input === 'R') && canRollbackFromDone) {
      void handleRollback();
    }
  }, { isActive: status === 'done' && canRollbackFromDone });

  const handleCancel = () => {
    navigate(`/${action}`);
  };

  const handleBack = () => {
    navigate('/');
  };

  if (status === 'running') {
    const waitingForLock = logLines.some((line) => line.includes('[wait] sync lock busy'));
    return (
      <Box flexDirection="column" padding={1}>
        <Header rootDir={rootDir} />
        <Text>{runLabel || `Running ${action}...`}</Text>
        {waitingForLock && (
          <Text color="yellow">Waiting for sync lock: another sync process is currently running.</Text>
        )}
        {logLines.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {logLines.map((line, idx) => (
              <Text key={`${idx}:${line}`} dimColor>{line}</Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (status === 'done') {
    const showRepair = action === 'doctor' && options.doctor.fix;
    return (
      <Box flexDirection="column" padding={1}>
        <Header rootDir={rootDir} />
        <Text color="green" bold>{action} completed successfully</Text>
        {showRepair && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Repair ID: {repairId || '(none)'}</Text>
            <Text>Repair Summary: {repairSummary || (options.doctor.dryRun ? 'dry-run (no files written)' : '(not available)')}</Text>
            <Text>Rollback: {repairRollback || (options.doctor.dryRun ? '(dry-run has no rollback)' : '(not available)')}</Text>
            {canRollbackFromDone && (
              <Text dimColor>Press R to rollback this repair and re-run native doctor.</Text>
            )}
            {rollbackResult && (
              <Text color={rollbackResult.level === 'error' ? 'red' : (rollbackResult.level === 'warn' ? 'yellow' : 'green')}>
                {rollbackResult.message}
              </Text>
            )}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Press Enter to return to main menu</Text>
        </Box>
        <ConfirmInput
          onConfirm={handleBack}
          onCancel={handleBack}
        />
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header rootDir={rootDir} />
        <Text color="red" bold>{action} failed</Text>
        <Text color="red">{errorMessage}</Text>
        <Box marginTop={1}>
          <ConfirmInput
            onConfirm={handleBack}
            onCancel={handleCancel}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Text bold>Confirm {action}</Text>
      <Box flexDirection="column" marginY={1}>
        {actionOptions && 'components' in actionOptions && (
          <Text>Selected components: {formatComponents(actionOptions.components as Record<string, boolean>)}</Text>
        )}
        {actionOptions && 'wrapMode' in actionOptions && (
          <Text>Mode: {actionOptions.wrapMode}</Text>
        )}
        {actionOptions && 'client' in actionOptions && (
          <Text>Client: {actionOptions.client}</Text>
        )}
        {actionOptions && 'scope' in actionOptions && (
          <Text>Scope: {actionOptions.scope}</Text>
        )}
        {actionOptions && 'selectedSkills' in actionOptions && (
          <Text>Selected skills: {formatSkills(actionOptions.selectedSkills as string[])}</Text>
        )}
        {nativePreview && (
          <>
            <Text>Native tier: {nativePreview.tier}</Text>
            {nativePreview.lines.map((line, idx) => (
              <Text key={`${idx}:${line}`}>Native: {line}</Text>
            ))}
            <Text dimColor>Verify after run: aios doctor --native</Text>
          </>
        )}
        {action === 'doctor' && (
          <>
            <Text>Strict: {options.doctor.strict ? 'true' : 'false'}</Text>
            <Text>Global security: {options.doctor.globalSecurity ? 'true' : 'false'}</Text>
            <Text>Native only: {options.doctor.nativeOnly ? 'true' : 'false'}</Text>
            <Text>Verbose: {options.doctor.verbose ? 'true' : 'false'}</Text>
            <Text>Auto-fix: {options.doctor.fix ? 'true' : 'false'}</Text>
            <Text>Dry-run: {options.doctor.dryRun ? 'true' : 'false'}</Text>
          </>
        )}
      </Box>
      <Box marginTop={1}>
        <Text bold>Run {action}?</Text>
        <ConfirmInput
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </Box>
    </Box>
  );
}
