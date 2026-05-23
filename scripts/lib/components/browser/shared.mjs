import { commandExists } from '../../platform/process.mjs';

export function requireCommand(name) {
  if (!commandExists(name)) {
    throw new Error(`Missing required command: ${name}`);
  }
}

export function formatErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
