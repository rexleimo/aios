// 中文注释：magpie 式 TUI——终端里的轻量控制面。基于 readline，不引额外依赖。
import readline from 'node:readline';
import { loadRegistry, registryFilePath } from './entry/registry.mjs';

function printHelp(io) {
  io.log('Commands: help | ls | providers | models | usage | set <client> <model> | profiles | save <name> | use <name> | quit');
}

export async function runTui({ io = console } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'magpie> ' });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  io.log('AIOS model-router TUI (type help)');
  rl.prompt();
  for await (const line of rl) {
    const parts = String(line).trim().split(/\s+/);
    const cmd = parts[0];
    try {
      if (!cmd || cmd === 'help') printHelp(io);
      else if (cmd === 'quit' || cmd === 'exit') { rl.close(); break; }
      else if (cmd === 'ls') {
        const r = await loadRegistry();
        io.log(JSON.stringify(r.models ? Object.keys(r.models) : [], null, 2));
      } else if (cmd === 'providers') {
        const r = await loadRegistry();
        io.log(JSON.stringify(r.providers || {}, null, 2));
      } else if (cmd === 'models') {
        const r = await loadRegistry();
        for (const [id, m] of Object.entries(r.models || {})) io.log(`${id}\t${(m.protocols || []).join('/')}`);
      } else if (cmd === 'set') {
        io.log('set: not yet wired to matrix write in TUI; use CLI `model-router` with registry edit for now.');
      } else if (cmd === 'profiles') {
        io.log('profiles stored in browser localStorage; CLI profiles via registry not yet implemented.');
      } else {
        io.log(`Unknown command: ${cmd}`);
      }
    } catch (e) {
      io.error(e instanceof Error ? e.message : String(e));
    }
    rl.prompt();
  }
  return { exitCode: 0 };
}