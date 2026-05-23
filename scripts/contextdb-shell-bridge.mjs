#!/usr/bin/env node
import { main } from './lib/contextdb/shell-bridge/main.mjs';

main().catch((err) => {
  console.error(`[contextdb-shell-bridge] fatal: ${err.message}`);
  process.exit(1);
});
