// scripts/lib/tui-ink/screens/HudScreen.tsx
import React from 'react';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Box, Text, useInput } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Checkbox } from '../components/Checkbox';

import {
  HUD_PROVIDER_AGENT_MAP,
  listContextDbSessions,
  readHudState,
} from '../../hud/state.mjs';
import { normalizeHudPreset, renderHud } from '../../hud/render.mjs';

type Provider = 'codex' | 'claude' | 'gemini' | 'opencode' | 'kiro';
type Preset = 'minimal' | 'focused' | 'full';

const PROVIDERS: Provider[] = ['codex', 'claude', 'gemini', 'opencode', 'kiro'];
const PRESETS: Preset[] = ['minimal', 'focused', 'full'];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cycleIndex(current: number, size: number, dir: 'next' | 'prev') {
  if (size <= 0) return 0;
  if (dir === 'next') return (current + 1) % size;
  return (current - 1 + size) % size;
}

function safeText(value: unknown) {
  return String(value ?? '').trim();
}

interface HudScreenProps {
  rootDir: string;
}

export function HudScreen({ rootDir }: HudScreenProps) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(0);
  const maxCursor = 5;

  const [providerIndex, setProviderIndex] = useState(0);
  const provider: Provider = PROVIDERS[providerIndex] ?? 'codex';

  const [presetIndex, setPresetIndex] = useState(1);
  const preset: Preset = PRESETS[presetIndex] ?? 'focused';

  const [watch, setWatch] = useState(false);

  const [sessions, setSessions] = useState<Array<{ sessionId: string; updatedAt?: string; goal?: string }>>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const sessionId = sessions[sessionIndex]?.sessionId ?? '';

  const [hudLines, setHudLines] = useState<string[]>(['(loading)']);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [error, setError] = useState('');

  const refreshInFlight = useRef(false);

  const refreshSessions = useCallback(async () => {
    const agent = HUD_PROVIDER_AGENT_MAP[provider];
    const metas = await listContextDbSessions(rootDir, { agent, limit: 20 });
    const normalized = metas.map((meta) => ({
      sessionId: safeText(meta?.sessionId),
      updatedAt: safeText(meta?.updatedAt),
      goal: safeText(meta?.goal),
    })).filter((meta) => meta.sessionId);
    setSessions(normalized);
    setSessionIndex(0);
  }, [rootDir, provider]);

  const refreshHud = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      setError('');
      const state = await readHudState({
        rootDir,
        sessionId,
        provider,
      });
      const text = renderHud(state, { preset: normalizeHudPreset(preset) });
      const lines = text.split(/\r?\n/);
      setHudLines(lines.length > 0 ? lines : ['(empty)']);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setHudLines([`(error) ${message}`]);
    } finally {
      refreshInFlight.current = false;
    }
  }, [rootDir, sessionId, provider, preset]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!sessionId) {
      setHudLines(['(no sessions found for selected provider)']);
      return;
    }
    void refreshHud();
  }, [sessionId, refreshHud]);

  useEffect(() => {
    if (!watch) return;
    const timer = setInterval(() => {
      void refreshHud();
    }, 1000);
    return () => clearInterval(timer);
  }, [watch, refreshHud]);

  useInput(
    useCallback((input, key) => {
      if (key.upArrow) {
        setCursor((prev) => clamp(prev - 1, 0, maxCursor));
        return;
      }
      if (key.downArrow) {
        setCursor((prev) => clamp(prev + 1, 0, maxCursor));
        return;
      }

      if (key.leftArrow) {
        if (cursor === 0) setProviderIndex((prev) => cycleIndex(prev, PROVIDERS.length, 'prev'));
        if (cursor === 1) setPresetIndex((prev) => cycleIndex(prev, PRESETS.length, 'prev'));
        if (cursor === 3) setSessionIndex((prev) => cycleIndex(prev, sessions.length, 'prev'));
        return;
      }

      if (key.rightArrow || input === ' ') {
        if (cursor === 0) setProviderIndex((prev) => cycleIndex(prev, PROVIDERS.length, 'next'));
        if (cursor === 1) setPresetIndex((prev) => cycleIndex(prev, PRESETS.length, 'next'));
        if (cursor === 2) setWatch((prev) => !prev);
        if (cursor === 3) setSessionIndex((prev) => cycleIndex(prev, sessions.length, 'next'));
        return;
      }

      if (input === 'r' || input === 'R') {
        void refreshHud();
        return;
      }

      if (key.return) {
        if (cursor === 4) {
          void refreshHud();
          return;
        }
        if (cursor === 5) {
          navigate('/');
          return;
        }
      }

      if (input === 'b' || input === 'B') {
        navigate('/');
      }
    }, [cursor, refreshHud, navigate, sessions.length])
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

  const sessionLabel = sessionId
    ? `${sessionId} (${sessionIndex + 1}/${Math.max(1, sessions.length)})`
    : '(none)';

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Text bold>HUD</Text>
      <Box flexDirection="column" marginY={1}>
        {renderValueItem('Provider', provider, 0)}
        {renderValueItem('Preset', preset, 1)}
        <Checkbox label="Watch (1s refresh)" checked={watch} active={cursor === 2} />
        {renderValueItem('Session', sessionLabel, 3)}
        {renderActionItem('Refresh now (or press r)', 4)}
        {renderActionItem('Back', 5)}
      </Box>

      {error ? (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginBottom={1}>
        {hudLines.map((line, idx) => (
          <Text key={`${idx}:${line}`} dimColor={idx === 0 && line.startsWith('AIOS HUD') ? false : undefined}>
            {line}
          </Text>
        ))}
      </Box>

      <Text dimColor>
        {lastUpdatedAt ? `Last refresh: ${lastUpdatedAt}. ` : ''}Use ↑/↓ to navigate, ←/→ or Space to change values, Enter to select.
      </Text>
      <Footer />
    </Box>
  );
}
