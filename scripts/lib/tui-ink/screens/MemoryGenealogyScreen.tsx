import React from 'react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Text, useInput } from 'ink';
import path from 'node:path';

import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import {
  formatGenealogyRows,
  formatNodeDetails,
  formatRiskSummary,
  type GenealogyRow,
} from '../genealogy-view';
import { buildMemoryGenealogyGraph } from '../../../../mcp-server/src/contextdb/genealogy.ts';
import type { MemoryGenealogyGraph } from '../../../../mcp-server/src/contextdb/genealogy.ts';

interface MemoryGenealogyScreenProps {
  rootDir: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampGenealogyCursor(value: number, rowCount: number): number {
  return clamp(value, 0, Math.max(0, rowCount - 1));
}

export function shouldShowGenealogyEmptyState({
  hasLoaded,
  isLoading,
  rowCount,
  error,
}: {
  hasLoaded: boolean;
  isLoading: boolean;
  rowCount: number;
  error: string;
}): boolean {
  return hasLoaded && !isLoading && !error && rowCount === 0;
}

export function formatGenealogyRefreshStatus(
  isLoading: boolean,
  hasLoaded: boolean,
  lastUpdatedAt: string,
): string {
  if (isLoading) return hasLoaded ? 'Refreshing...' : 'Loading...';
  return lastUpdatedAt ? `Last refresh: ${lastUpdatedAt}.` : '';
}

function resolveWorkspaceRoot(rootDir: string): string {
  return process.env.AIOS_PROJECT_ROOT || rootDir;
}

function resolveProjectName(workspaceRoot: string): string {
  const name = path.basename(workspaceRoot).trim();
  return name || 'aios';
}

export function MemoryGenealogyScreen({ rootDir }: MemoryGenealogyScreenProps) {
  const navigate = useNavigate();
  const workspaceRoot = resolveWorkspaceRoot(rootDir);
  const project = resolveProjectName(workspaceRoot);
  const [includeEvents, setIncludeEvents] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [graph, setGraph] = useState<MemoryGenealogyGraph | null>(null);
  const [rows, setRows] = useState<GenealogyRow[]>([]);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const refreshIdRef = useRef(0);

  const refreshGraph = useCallback(async (nextIncludeEvents = includeEvents) => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;
    setIsLoading(true);

    try {
      setError('');
      const nextGraph = await buildMemoryGenealogyGraph({
        workspaceRoot,
        project,
        limit: 40,
        includeEvents: nextIncludeEvents,
        eventsPerSession: 10,
      });

      if (refreshId !== refreshIdRef.current) return;

      const nextRows = formatGenealogyRows(nextGraph);
      setGraph(nextGraph);
      setRows(nextRows);
      setCursor((prev) => clampGenealogyCursor(prev, nextRows.length));
      setLastUpdatedAt(new Date().toISOString());
      setHasLoaded(true);
      setIsLoading(false);
    } catch (err) {
      if (refreshId !== refreshIdRef.current) return;

      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setGraph(null);
      setRows([]);
      setCursor(0);
      setLastUpdatedAt('');
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [includeEvents, project, workspaceRoot]);

  useEffect(() => {
    void refreshGraph(includeEvents);
  }, [includeEvents, refreshGraph]);

  useInput(
    useCallback((input, key) => {
      if (key.upArrow) {
        setCursor((prev) => clampGenealogyCursor(prev - 1, rows.length));
        return;
      }
      if (key.downArrow) {
        setCursor((prev) => clampGenealogyCursor(prev + 1, rows.length));
        return;
      }
      if (input === 'e' || input === 'E') {
        setIncludeEvents((prev) => !prev);
        return;
      }
      if (input === 'r' || input === 'R') {
        void refreshGraph(includeEvents);
        return;
      }
      if (input === 'b' || input === 'B') {
        navigate('/');
      }
    }, [includeEvents, navigate, refreshGraph, rows.length])
  );

  const selected = rows[cursor];
  const visibleStart = Math.max(0, cursor - 5);
  const visibleRows = rows.slice(visibleStart, visibleStart + 11);
  const summary = graph?.summary;
  const eventState = includeEvents
    ? 'Events: showing redacted raw nodes'
    : 'Events: hidden (press E to reveal redacted raw events)';
  const refreshStatus = formatGenealogyRefreshStatus(isLoading, hasLoaded, lastUpdatedAt);

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Text bold>Memory Genealogy</Text>
      <Text dimColor>Workspace: {workspaceRoot}</Text>
      <Text dimColor>{eventState}</Text>
      {refreshStatus ? <Text dimColor>{refreshStatus}</Text> : null}

      {summary ? (
        <Box flexDirection="column" marginY={1}>
          <Text>
            Project {graph?.project} | Nodes {summary.nodes} | Edges {summary.edges} | Sessions {summary.sessions} | Checkpoints {summary.checkpoints} | Hidden events {summary.hiddenEvents}
          </Text>
          <Text>Risks: {formatRiskSummary(summary.risks)}</Text>
          <Text color={graph?.warnings.length ? 'yellow' : undefined}>Warnings: {graph?.warnings.length ?? 0}</Text>
        </Box>
      ) : null}

      {error ? (
        <Box marginY={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      ) : null}

      {shouldShowGenealogyEmptyState({ hasLoaded, isLoading, rowCount: rows.length, error }) ? (
        <Box marginY={1}>
          <Text dimColor>No genealogy rows found for project {project}. Press R to refresh or B to go back.</Text>
        </Box>
      ) : null}

      {rows.length > 0 ? (
        <Box flexDirection="column" marginY={1}>
          {visibleRows.map((row, offset) => {
            const index = visibleStart + offset;
            const active = index === cursor;
            const indent = '  '.repeat(Math.min(row.depth, 5));
            return (
              <Text key={row.id} color={active ? 'cyan' : undefined} bold={active}>
                {active ? '> ' : '  '}{indent}{row.label} [{row.detail}]
              </Text>
            );
          })}
        </Box>
      ) : null}

      {selected ? (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Selected</Text>
          {formatNodeDetails(selected.node).slice(0, 10).map((line, index) => (
            <Text key={`${index}:${line}`} dimColor>{line}</Text>
          ))}
          {graph?.warnings.length ? (
            <Text color="yellow">First warning: {graph.warnings[0]}</Text>
          ) : null}
        </Box>
      ) : null}

      <Text dimColor>
        Use Up/Down, E events, R refresh, B back.
      </Text>
      <Footer hints={['Up/Down Navigate', 'E Events', 'R Refresh', 'B Back', 'Q Quit']} />
    </Box>
  );
}
