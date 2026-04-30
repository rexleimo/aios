import { startServer } from './server.js';

const args = process.argv.slice(2);
let port = 39200;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = Number(args[i + 1]);
    i++;
  }
}

startServer({ port }).catch((err) => {
  console.error('Failed to start debug-hub:', err);
  process.exit(1);
});
