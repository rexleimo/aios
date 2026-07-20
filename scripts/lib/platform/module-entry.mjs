import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// macOS can invoke a script through /var while import.meta.url uses /private/var.
export function isDirectModuleInvocation(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;

  const modulePath = fileURLToPath(metaUrl);
  const invocationPath = path.resolve(argvPath);
  try {
    return fs.realpathSync(modulePath) === fs.realpathSync(invocationPath);
  } catch {
    return path.resolve(modulePath) === invocationPath;
  }
}
