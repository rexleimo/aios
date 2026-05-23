#!/usr/bin/env node
import { main } from './cli/main.js';

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
