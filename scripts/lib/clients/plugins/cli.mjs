// scripts/lib/clients/plugins/cli.mjs — `aios plugin` 命令实现。
// 纪律：零 try-catch / 零 if-else 级联——用 ts-pattern match 分派 action，attempt 包外部调用。
import path from 'node:path';
import { match } from 'ts-pattern';

import { loadPluginManifest } from './loader.mjs';
import { handleProviderRpc } from './builtin-provider.mjs';
import { applyInstalledContributions, removeContributions } from './adapters/apply.mjs';
import { dispatchContributions } from './core/dispatch.mjs';
import { queryPluginProviders } from './adapters/provider.mjs';
import { installGithubPlugin } from './sources/github.mjs';
import { changePluginsRegistry, readPluginsRegistry, resolvePluginsRegistryPath, writePluginsRegistry } from './core/registry.mjs';
import { attempt, attemptAsync } from './core/result.mjs';

function render(ok, payload, { json }, stdout) {
  stdout.write(`${JSON.stringify({ ok, ...payload }, null, 2)}\n`);
  return { exitCode: ok ? 0 : 1 };
}
function text(stdout, lines) {
  stdout.write(`${lines.join('\n')}\n`);
  return { exitCode: 0 };
}

const list = ({ rootDir, json, stdout }) => {
  const result = readPluginsRegistry({ rootDir });
  return match(result)
    .with({ ok: true }, ({ value }) => (json
      ? render(true, { plugins: value }, { json }, stdout)
      : value.length === 0
        ? text(stdout, ['No plugins installed.', `Registry: ${resolvePluginsRegistryPath(rootDir)}`])
        : text(stdout, ['Installed plugins:', ...value.flatMap((p) => [`  ${p.id}  ${p.enabled ? 'enabled' : 'disabled'}`, `      manifest  ${p.manifest}`])])))
    .with({ ok: false }, ({ error }) => render(false, { error }, { json }, stdout))
    .exhaustive();
};

const installGithub = async ({ rootDir, options, json, stdout }) => {
  const result = await installGithubPlugin({
    rootDir,
    source: options.source,
    id: options.id,
    ref: options.ref,
  });
  return match(result)
    .with({ ok: false }, ({ error }) => render(false, { error }, { json }, stdout))
    .with({ ok: true }, ({ value }) => {
      const applied = applyInstalledContributions({ rootDir });
      return json
        ? render(true, { ...value, applied }, { json }, stdout)
        : text(stdout, [
          `Installed plugin ${value.id} from ${value.source} at ${value.commit}.`,
          `Manifest: ${value.manifest}`,
          '重启 gateway / 刷新 console 让 contributions 生效。',
        ]);
    })
    .exhaustive();
};

const install = async ({ rootDir, options, json, stdout }) => {
  if (options.source) return installGithub({ rootDir, options, json, stdout });
  const id = String(options.id || '').trim();
  const dir = String(options.dir || options.manifest || '').trim();
  if (!id || !dir) return render(false, { error: 'install requires --id and --dir' }, { json }, stdout);
  const manifestResult = loadPluginManifest({ dir: path.resolve(rootDir, dir) });
  return match(manifestResult)
    .with({ ok: false }, ({ error }) => render(false, { error }, { json }, stdout))
    .with({ ok: true }, ({ value: manifest }) => {
      if (manifest.id !== id) return render(false, { error: `manifest id ${manifest.id} != requested ${id}` }, { json }, stdout);
      const changed = changePluginsRegistry({ rootDir, action: 'add', id, manifest: dir });
      return match(changed)
        .with({ ok: false }, ({ error }) => render(false, { error }, { json }, stdout))
        .with({ ok: true }, ({ value }) => {
          attempt(() => writePluginsRegistry({ rootDir, plugins: value.plugins }));
          const applied = applyInstalledContributions({ rootDir });
          return json
            ? render(true, { installed: id, manifest: dir, contributes: manifest.contributes, applied }, { json }, stdout)
            : text(stdout, [`Installed plugin ${id} (${dir}).`, '重启 gateway / 刷新 console 让 contributions 生效。']);
        })
        .exhaustive();
    })
    .exhaustive();
};

const queryProviders = async ({ rootDir, action, json, stdout }) => {
  const rpc = attempt(() => handleProviderRpc({ rootDir, method: action }));
  if (!rpc.ok) return render(false, { error: rpc.error }, { json }, stdout);
  const pluginResult = await attemptAsync(async () => {
    const installedResult = readPluginsRegistry({ rootDir });
    if (!installedResult.ok) return [];
    const manifests = installedResult.value.flatMap((entry) => {
      const dir = path.isAbsolute(entry.manifest) ? entry.manifest : path.join(rootDir, entry.manifest);
      const manifestResult = loadPluginManifest({ dir });
      return manifestResult.ok ? [{ id: entry.id, dir: entry.manifest, manifest: manifestResult.value }] : [];
    });
    const dispatched = dispatchContributions({ manifests });
    return queryPluginProviders({ rootDir, sources: dispatched.providerSources, method: action });
  });
  const pluginProviders = pluginResult.ok ? pluginResult.value : [];
  if (json) return render(true, { [action]: rpc.value.data, pluginProviders }, { json }, stdout);
  const rows = rpc.value.data.map((item) => `  ${item.id}  ${item.provider || item.baseUrl || ''}${item.modelCount !== undefined ? ` (${item.modelCount} models)` : ''}`);
  const pluginRows = pluginProviders.map((p) => `  [plugin:${p.plugin}] ${p.ok ? `${p.data?.length ?? 0} ${action}` : `error: ${p.error}`}`);
  return text(stdout, [`Real ${action} from model registry:`, ...rows, ...pluginRows]);
};

const mutate = ({ rootDir, action, options, json, stdout }) => {
  const id = String(options.id || '').trim();
  const changed = changePluginsRegistry({ rootDir, action, id });
  return match(changed)
    .with({ ok: false }, ({ error }) => render(false, { error }, { json }, stdout))
    .with({ ok: true }, ({ value }) => {
      attempt(() => writePluginsRegistry({ rootDir, plugins: value.plugins }));
      const applied = match(action)
        .with('remove', () => removeContributions({ rootDir, pluginId: id }))
        .otherwise(() => applyInstalledContributions({ rootDir }));
      return json
        ? render(true, { id, enabled: action === 'enable', applied }, { json }, stdout)
        : text(stdout, [`${id} ${action === 'enable' ? 'enabled' : action === 'disable' ? 'disabled' : 'removed'}.`]);
    })
    .exhaustive();
};

export async function runPluginCommand(options = {}, context = {}) {
  const stdout = context.stdout || process.stdout;
  const rootDir = context.projectRoot || context.rootDir || process.cwd();
  const json = options.json === true;
  const action = String(options.action || options.subcommand || 'list').trim();
  const args = { rootDir, options, json, stdout, action };

  return match(action)
    .with('list', () => list(args))
    .with('install', 'add', () => install(args))
    .with('providers', 'models', () => queryProviders(args))
    .with('remove', 'enable', 'disable', () => mutate(args))
    .otherwise(() => render(false, { error: `unknown plugin action ${JSON.stringify(action)}` }, { json }, stdout));
}
