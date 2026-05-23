#!/usr/bin/env node
import { runSecurityConfigDoctor } from './lib/doctor/security-config/run.mjs';

try {
  process.exit(runSecurityConfigDoctor({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
  }));
} catch (error) {
  process.stderr.write(`[error] ${error && error.message ? error.message : String(error)}\n`);
  process.exit(2);
}