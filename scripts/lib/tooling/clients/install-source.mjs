import { inspectExecutable, readMetadata } from './runtime.mjs';

const POLICIES = Object.freeze({
  claude: Object.freeze({ packageName: '@anthropic-ai/claude-code', bin: 'claude' }),
  codex: Object.freeze({ packageName: '@openai/codex', bin: 'codex' }),
  pi: Object.freeze({ packageName: '@mariozechner/pi-coding-agent', bin: 'pi' }),
});
const VERSION = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;

export function hasInventoryPolicy(id) {
  return Object.hasOwn(POLICIES, id);
}

function unsupported(kind, reason, evidence = []) {
  return { kind, supported: false, reason, evidence };
}

function metadataEvidence(metadata) {
  return { type: 'package-metadata', path: metadata.path, digest: metadata.digest, identity: metadata.identity };
}

function externalManager(executable) {
  const paths = [executable.path, executable.realPath].map((value) => value.replaceAll('\\', '/'));
  if (paths.some((value) => /\/(?:Cellar|Caskroom|\.linuxbrew)\//.test(value))) {
    return unsupported('homebrew', 'Homebrew-managed installations are not supported by this updater.');
  }
  if (paths.some((value) => /\/(?:snap|nix\/store|WindowsApps)\//i.test(value) || /\.app\/Contents\//.test(value))) {
    return unsupported('store', 'Store, app-bundle, and immutable package-manager installations require their own updater.');
  }
  return null;
}

async function npmSource(id, executable, runtime) {
  const policy = POLICIES[id];
  const { paths } = runtime;
  // A global bin link AND the matching global package's bin metadata must agree.
  if (paths.basename(executable.path) !== policy.bin || paths.basename(paths.dirname(executable.path)) !== 'bin') return null;
  const prefix = paths.dirname(paths.dirname(executable.path));
  const root = paths.join(prefix, 'lib', 'node_modules', ...policy.packageName.split('/'));
  if (!executable.realPath.startsWith(`${root}${paths.sep}`)) return null;
  let metadata;
  try {
    if (await runtime.fs.realpath(root) !== root) return unsupported('unknown', 'Linked or relocated npm package roots are ambiguous.');
    metadata = await readMetadata(paths.join(root, 'package.json'), runtime);
    const entry = typeof metadata.data.bin === 'string' ? metadata.data.bin : metadata.data.bin?.[policy.bin];
    if (metadata.data.name !== policy.packageName || !VERSION.test(metadata.data.version ?? '') || typeof entry !== 'string') {
      return unsupported('unknown', 'Global package metadata does not match the known client package.');
    }
    const binPath = paths.resolve(root, entry);
    if (!binPath.startsWith(`${root}${paths.sep}`) || await runtime.fs.realpath(binPath) !== executable.realPath) {
      return unsupported('unknown', 'Global package bin metadata does not match the executable.');
    }
    const source = {
      kind: 'npm-global', packageName: policy.packageName, packageVersion: metadata.data.version, prefix,
      evidence: [{ type: 'npm-global-layout', root, prefix }, metadataEvidence(metadata)],
      supported: false, reason: 'The npm runner for this exact global prefix could not be verified.',
    };
    try {
      const npmRoot = paths.join(prefix, 'lib', 'node_modules', 'npm');
      const npmMetadata = await readMetadata(paths.join(npmRoot, 'package.json'), runtime);
      if (npmMetadata.data.name !== 'npm' || !VERSION.test(npmMetadata.data.version ?? '') || npmMetadata.data.bin?.npm !== 'bin/npm-cli.js') return source;
      const npm = await inspectExecutable(paths.join(npmRoot, 'bin', 'npm-cli.js'), runtime);
      if (npm.realPath !== paths.join(await runtime.fs.realpath(npmRoot), 'bin', 'npm-cli.js')) return source;
      const node = await inspectExecutable(runtime.nodePath, runtime);
      source.evidence.push(metadataEvidence(npmMetadata), { type: 'npm-runner', ...npm }, { type: 'node-runner', ...node });
      return { ...source, supported: true, reason: null, runner: { node: node.realPath, npm: npm.realPath } };
    } catch {
      return source;
    }
  } catch {
    return unsupported('unknown', 'Global package metadata is missing, unreadable, changing, or invalid.', metadata ? [metadataEvidence(metadata)] : []);
  }
}

export async function classifySource(id, executable, runtime) {
  const external = externalManager(executable);
  if (external) return external;
  if (!hasInventoryPolicy(id)) return unsupported('unsupported', 'Executable inventory is available, but source-specific updates for this client are not implemented.');
  if (runtime.platform === 'win32') return unsupported('unknown', 'Windows shims cannot be safely attributed to a supported installer yet.');
  const npm = await npmSource(id, executable, runtime);
  if (npm) return npm;
  const nativeRoot = runtime.paths.join(runtime.home, '.local', 'share', 'claude', 'versions');
  if (id === 'claude' && runtime.paths.dirname(executable.realPath) === nativeRoot && VERSION.test(runtime.paths.basename(executable.realPath))) {
    return unsupported('claude-native', 'Native Claude layout is present, but layout alone does not prove official binary provenance; automatic update is disabled.',
      [{ type: 'native-layout-only', root: nativeRoot }]);
  }
  return unsupported('unknown', 'Install source is unverified; no update command will be guessed from the executable or config location.');
}

export function buildUpdateCommand(client, runtime) {
  const policy = Object.hasOwn(POLICIES, client.id) ? POLICIES[client.id] : null;
  const source = client.source;
  if (!policy || !source.supported || source.kind !== 'npm-global' || source.packageName !== policy.packageName) return null;
  return {
    file: source.runner.node,
    args: [source.runner.npm, 'update', '--global', '--prefix', source.prefix,
      '--userconfig', runtime.platform === 'win32' ? 'NUL' : '/dev/null',
      '--globalconfig', runtime.platform === 'win32' ? 'NUL' : '/dev/null',
      '--registry', 'https://registry.npmjs.org', '--', policy.packageName],
    shell: false,
  };
}
