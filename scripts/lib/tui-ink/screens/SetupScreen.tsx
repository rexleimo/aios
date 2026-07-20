// scripts/lib/tui-ink/screens/SetupScreen.tsx
import React from 'react';

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Checkbox } from '../components/Checkbox';
import { getNativePreview } from '../native-preview';
import type { SetupOptions, ComponentsConfig } from '../types';

interface SetupScreenProps {
  rootDir: string;
  options: SetupOptions;
  onToggleComponent: (component: keyof ComponentsConfig) => void;
  onCycleWrapMode: () => void;
  onCycleWrapModePrevious: () => void;
  onCycleScope: () => void;
  onCycleScopePrevious: () => void;
  onCycleClient: () => void;
  onCycleClientPrevious: () => void;
  onToggleSkipPlaywright: () => void;
  onToggleSkipDoctor: () => void;
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

export function SetupScreen({
  rootDir,
  options,
  onToggleComponent,
  onCycleWrapMode,
  onCycleWrapModePrevious,
  onCycleScope,
  onCycleScopePrevious,
  onCycleClient,
  onCycleClientPrevious,
  onToggleSkipPlaywright,
  onToggleSkipDoctor,
  onSelectSkills,
  onRun,
}: SetupScreenProps) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(0);
  const maxCursor = 11;

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
            onCycleWrapMode();
          } else if (cursor === 5) {
            onCycleScope();
          } else if (cursor === 6) {
            onCycleClient();
          } else if (cursor === 7) {
            onToggleSkipPlaywright();
          } else if (cursor === 8) {
            onToggleSkipDoctor();
          }
        } else if (key.rightArrow) {
          if (cursor >= 0 && cursor <= 3) {
            onToggleComponent(COMPONENTS_KEYS[cursor]);
          } else if (cursor === 4) {
            onCycleWrapMode();
          } else if (cursor === 5) {
            onCycleScope();
          } else if (cursor === 6) {
            onCycleClient();
          } else if (cursor === 7) {
            onToggleSkipPlaywright();
          } else if (cursor === 8) {
            onToggleSkipDoctor();
          }
        } else if (key.leftArrow) {
          if (cursor === 4) {
            onCycleWrapModePrevious();
          } else if (cursor === 5) {
            onCycleScopePrevious();
          } else if (cursor === 6) {
            onCycleClientPrevious();
          }
        } else if (key.return) {
          if (cursor === 9) {
            onSelectSkills();
          } else if (cursor === 10) {
            onRun();
          } else if (cursor === 11) {
            navigate('/');
          }
        } else if (input === 'b' || input === 'B') {
          navigate('/');
        }
      },
      [
        cursor,
        onToggleComponent,
        onCycleWrapMode,
        onCycleWrapModePrevious,
        onCycleScope,
        onCycleScopePrevious,
        onCycleClient,
        onCycleClientPrevious,
        onToggleSkipPlaywright,
        onToggleSkipDoctor,
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
      <Text bold>Setup configuration</Text>
      <Box flexDirection="column" marginY={1}>
        {COMPONENTS_KEYS.map((key, idx) => (
          <Checkbox
            key={key}
            label={COMPONENTS_LABELS[key]}
            checked={options.components[key]}
            active={cursor === idx}
          />
        ))}
        {renderValueItem('Mode', options.wrapMode, 4)}
        {renderValueItem('Skills scope', options.scope, 5)}
        {renderValueItem('Client', options.client, 6)}
        <Checkbox
          label="Skip Playwright install"
          checked={options.skipPlaywrightInstall}
          active={cursor === 7}
        />
        <Checkbox
          label="Skip doctor"
          checked={options.skipDoctor}
          active={cursor === 8}
        />
        {renderValueItem('Selected skills', selectedSkillsDisplay, 9)}
        {renderActionItem('Run setup', 10)}
        {renderActionItem('Back', 11)}
      </Box>
      <Box flexDirection="column">
        {options.components.native ? (
          <>
            <Text color="green">Native preview ({nativePreview.tier})</Text>
            {nativePreview.lines.map((line, idx) => (
              <Text key={`${idx}:${line}`} dimColor>  {line}</Text>
            ))}
          </>
        ) : (
          <Text dimColor>Native enhancements are disabled for this run.</Text>
        )}
      </Box>
      <Footer />
    </Box>
  );
}
