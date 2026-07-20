// scripts/lib/tui-ink/screens/DoctorScreen.tsx
import React from 'react';

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Checkbox } from '../components/Checkbox';
import type { DoctorOptions } from '../types';

interface DoctorScreenProps {
  rootDir: string;
  options: DoctorOptions;
  onToggleStrict: () => void;
  onToggleGlobalSecurity: () => void;
  onToggleNativeOnly: () => void;
  onToggleVerbose: () => void;
  onToggleFix: () => void;
  onToggleDryRun: () => void;
  onRun: () => void;
}

export function DoctorScreen({
  rootDir,
  options,
  onToggleStrict,
  onToggleGlobalSecurity,
  onToggleNativeOnly,
  onToggleVerbose,
  onToggleFix,
  onToggleDryRun,
  onRun,
}: DoctorScreenProps) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(0);
  const maxCursor = 7;

  useInput(
    useCallback(
      (input, key) => {
        if (key.upArrow) {
          setCursor(prev => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setCursor(prev => Math.min(maxCursor, prev + 1));
        } else if (input === ' ' || key.rightArrow) {
          if (cursor === 0) {
            onToggleStrict();
          } else if (cursor === 1) {
            onToggleGlobalSecurity();
          } else if (cursor === 2) {
            onToggleNativeOnly();
          } else if (cursor === 3) {
            onToggleVerbose();
          } else if (cursor === 4) {
            onToggleFix();
          } else if (cursor === 5) {
            onToggleDryRun();
          }
        } else if (key.return) {
          if (cursor === 6) {
            onRun();
          } else if (cursor === 7) {
            navigate('/');
          }
        } else if (input === 'b' || input === 'B') {
          navigate('/');
        }
      },
      [
        cursor,
        onToggleStrict,
        onToggleGlobalSecurity,
        onToggleNativeOnly,
        onToggleVerbose,
        onToggleFix,
        onToggleDryRun,
        onRun,
        navigate,
      ]
    )
  );

  const renderActionItem = (label: string, idx: number) => (
    <Text color={cursor === idx ? 'cyan' : undefined} bold={cursor === idx}>
      {cursor === idx ? '▸ ' : '  '}{label}
    </Text>
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Text bold>Doctor configuration</Text>
      <Box flexDirection="column" marginY={1}>
        <Checkbox label="Strict" checked={options.strict} active={cursor === 0} />
        <Checkbox label="Global security scan" checked={options.globalSecurity} active={cursor === 1} />
        <Checkbox label="Native only" checked={options.nativeOnly} active={cursor === 2} />
        <Checkbox label="Verbose output" checked={options.verbose} active={cursor === 3} />
        <Checkbox label="Auto-fix native" checked={options.fix} active={cursor === 4} />
        <Checkbox label="Dry-run auto-fix" checked={options.dryRun} active={cursor === 5} />
        {renderActionItem('Run doctor', 6)}
        {renderActionItem('Back', 7)}
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          {options.nativeOnly
            ? 'Native only mode checks repo-local native surfaces only.'
            : 'Full doctor mode includes native plus shell, skills, and browser gates.'}
          {options.verbose ? ' Verbose mode prints extra diagnostics.' : ''}
          {options.dryRun && !options.fix ? ' Dry-run is effective when auto-fix is enabled.' : ''}
        </Text>
      </Box>
      <Footer />
    </Box>
  );
}
