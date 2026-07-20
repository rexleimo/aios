// scripts/lib/tui-ink/screens/UninstallScreen.tsx
import React from 'react';

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Checkbox } from '../components/Checkbox';
import { getNativePreview } from '../native-preview';
import type { UninstallOptions, ComponentsConfig } from '../types';

interface UninstallScreenProps {
  rootDir: string;
  options: UninstallOptions;
  onToggleComponent: (component: keyof ComponentsConfig) => void;
  onCycleScope: () => void;
  onCycleScopePrevious: () => void;
  onCycleClient: () => void;
  onCycleClientPrevious: () => void;
  onSelectSkills: () => void;
  onRun: () => void;
}

const COMPONENTS_KEYS: (keyof ComponentsConfig)[] = ['browser', 'shell', 'skills', 'native'];
const COMPONENTS_LABELS: Record<keyof ComponentsConfig, string> = {
  browser: 'Browser MCP',
  shell: 'Shell wrappers',
  skills: 'Skills',
  native: 'Native enhancements',
};

export function UninstallScreen({
  rootDir,
  options,
  onToggleComponent,
  onCycleScope,
  onCycleScopePrevious,
  onCycleClient,
  onCycleClientPrevious,
  onSelectSkills,
  onRun,
}: UninstallScreenProps) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(0);
  const maxCursor = 8;

  useInput(
    useCallback(
      (input, key) => {
        if (key.upArrow) {
          setCursor(prev => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setCursor(prev => Math.min(maxCursor, prev + 1));
        } else if (input === ' ') {
          if (cursor >= 0 && cursor <= 3) {
            onToggleComponent(COMPONENTS_KEYS[cursor]);
          } else if (cursor === 4) {
            onCycleScope();
          } else if (cursor === 5) {
            onCycleClient();
          }
        } else if (key.rightArrow) {
          if (cursor >= 0 && cursor <= 3) {
            onToggleComponent(COMPONENTS_KEYS[cursor]);
          } else if (cursor === 4) {
            onCycleScope();
          } else if (cursor === 5) {
            onCycleClient();
          }
        } else if (key.leftArrow) {
          if (cursor === 4) {
            onCycleScopePrevious();
          } else if (cursor === 5) {
            onCycleClientPrevious();
          }
        } else if (key.return) {
          if (cursor === 6) {
            onSelectSkills();
          } else if (cursor === 7) {
            onRun();
          } else if (cursor === 8) {
            navigate('/');
          }
        } else if (input === 'b' || input === 'B') {
          navigate('/');
        }
      },
      [
        cursor,
        onToggleComponent,
        onCycleScope,
        onCycleScopePrevious,
        onCycleClient,
        onCycleClientPrevious,
        onSelectSkills,
        onRun,
        navigate,
      ]
    )
  );

  const renderValueItem = (label: string, value: string, idx: number) => (
    <Text color={cursor === idx ? 'cyan' : undefined} bold={cursor === idx}>
      {cursor === idx ? '▸ ' : '  '}{label}: {value}
    </Text>
  );

  const renderActionItem = (label: string, idx: number) => (
    <Text color={cursor === idx ? 'cyan' : undefined} bold={cursor === idx}>
      {cursor === idx ? '▸ ' : '  '}{label}
    </Text>
  );

  const selectedSkillsDisplay = options.selectedSkills.length <= 3
    ? options.selectedSkills.join(', ') || '<none>'
    : `${options.selectedSkills.length} selected`;
  const nativePreview = getNativePreview(options.client);

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Text bold>Uninstall configuration</Text>
      <Box flexDirection="column" marginY={1}>
        {COMPONENTS_KEYS.map((key, idx) => (
          <Checkbox
            key={key}
            label={COMPONENTS_LABELS[key]}
            checked={options.components[key]}
            active={cursor === idx}
          />
        ))}
        {renderValueItem('Skills scope', options.scope, 4)}
        {renderValueItem('Client', options.client, 5)}
        {renderValueItem('Selected skills', selectedSkillsDisplay, 6)}
        {renderActionItem('Run uninstall', 7)}
        {renderActionItem('Back', 8)}
      </Box>
      <Box flexDirection="column">
        {options.components.native ? (
          <>
            <Text color="yellow">Native uninstall preview ({nativePreview.tier})</Text>
            {nativePreview.lines.map((line, idx) => (
              <Text key={`${idx}:${line}`} dimColor>  remove managed segments in: {line}</Text>
            ))}
          </>
        ) : (
          <Text dimColor>Native enhancements are not selected for uninstall.</Text>
        )}
      </Box>
      <Footer />
    </Box>
  );
}
