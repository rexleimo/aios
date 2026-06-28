import { generateBenchmark } from './lib/rl-shell-v1/task-registry.mjs';
import { createCliParser } from '../src/shared/cli-parser.mjs';

const cli = createCliParser({
  name: 'generate-rl-shell-v1-benchmark',
  description: 'Generate RL Shell V1 benchmark task data',
  options: [
    ['--config <path>', 'Benchmark config path'],
    ['--seed <n>', 'Random seed (default: 0)'],
  ],
});

const parsed = cli.parse(process.argv.slice(2));
if (parsed.help) {
  console.log(cli.program.helpInformation());
  process.exit(0);
}

const options = {
  configPath: parsed.flags.config || 'experiments/rl-shell-v1/configs/benchmark-v1.json',
  seed: parsed.flags.seed !== undefined ? Number.parseInt(parsed.flags.seed, 10) || 0 : 0,
};

const result = await generateBenchmark({
  rootDir: process.cwd(),
  seed: options.seed,
  configPath: options.configPath,
});

console.log(`generated=${result.generatedTasks.length}`);
console.log(`train=${result.trainTasks.length}`);
console.log(`held_out=${result.heldOutTasks.length}`);
