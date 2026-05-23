import path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveContextDbRoot, toWorkspaceRelative } from '../paths.js';

export function resolveOutputPath(workspaceRoot: string, outputPath: string): string {
  return path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(workspaceRoot, outputPath);
}

export function defaultContextDbOutputPath(workspaceRoot: string, ...segments: string[]): string {
  return toWorkspaceRelative(
    workspaceRoot,
    path.join(resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true }), ...segments)
  );
}

export async function appendJsonLineFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}
