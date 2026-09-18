# Shell Shim Baked Root Guard — GREEN Implementation Diff

- Work item: `shell-shim-baked-root-guard`
- Date: 2026-09-18
- Stage: `software.testing.tdd` / `green`
- Test scope contract: `docs/plans/2026-09-18-shell-shim-baked-root-guard-test-scope.md`
- RED observation: `docs/plans/2026-09-18-shell-shim-baked-root-guard-red-observation.md`

## Exact command

```
node --test scripts/tests/aios-components.test.mjs
```

cwd: `E:\coding\harness-cli`
Receipt: `receipt:34721788-a730-43a5-ae78-bbd020d7de68`
Exit status: `0`
Suite totals: `pass 39 / fail 0`
Adjacent check (`aios-components` + `token-discipline`): `pass 47 / fail 0`

## Boundary of the change

Only `scripts/lib/components/shell.mjs` changed, and only two places:

1. three module-local helpers added (`readShimBakedRoot`, `expandShimRoot`,
   `shimBakedRootResolves`);
2. the marker-present branch of `doctorContextDbShell`'s shim loop now resolves
   the shim's own baked root before reporting `[ok]`.

Not touched: shim templates (`buildPosixNativeShim`,
`buildWindowsNativeShim`, `buildPosixAiosLauncher`,
`buildWindowsAiosLauncher`), `installNativeShims`, `installContextDbShell`,
`uninstallContextDbShell`, path/RC handling, `mcp-server/`, rex-harness.

The stale-root warning is registered with `{ effective: false }`, so a shim
that still works through probe fallback does not turn `aios doctor` into an
effective failure.

## Diff

```diff
@@ -67,6 +67,39 @@ function resolveNativeShimCommandNames() {
   return ['aios', ...resolveClientCommandNames('all')];
 }
 
+const NATIVE_SHIM_RUNTIME_ANCHORS = ['scripts/aios.mjs', 'scripts/contextdb-shell-bridge.mjs'];
+
+/**
+ * 中文注释：shim 烘焙的 runtime root 可能因目录迁移或测试临时根而失效。只读取 shim
+ * 自己声明的 baked root，不从其他字符串里猜路径。
+ */
+function readShimBakedRoot(content) {
+  if (!content) return '';
+  const posixMatch = content.match(/^_aios_root_baked=(.*)$/mu);
+  if (posixMatch) {
+    const raw = posixMatch[1].trim();
+    const unquoted = raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw;
+    return unquoted.trim();
+  }
+  const windowsMatch = content.match(/set "AIOS_ROOT_DIR=([^"%][^"]*)"/u);
+  return windowsMatch ? windowsMatch[1].trim() : '';
+}
+
+function expandShimRoot(root, { env = process.env, homeDir = os.homedir() } = {}) {
+  return String(root || '')
+    .replace(/\$\{HOME\}/gu, homeDir)
+    .replace(/\$HOME\b/gu, homeDir)
+    .replace(/\$\{AIOS_ROOT_DIR\}/gu, env.AIOS_ROOT_DIR || '')
+    .replace(/\$AIOS_ROOT_DIR\b/gu, env.AIOS_ROOT_DIR || '');
+}
+
+function shimBakedRootResolves(root, options = {}) {
+  const expanded = expandShimRoot(root, options);
+  if (!expanded) return false;
+  const absolute = path.resolve(expanded);
+  return NATIVE_SHIM_RUNTIME_ANCHORS.some((anchor) => fs.existsSync(path.join(absolute, anchor)));
+}
+
 function envPathEntries(env = process.env) {
@@ -409,7 +442,12 @@ export async function doctorContextDbShell({
     if (content?.includes(NATIVE_SHIM_MARK)) {
-      io.log(`[ok] native shim installed: ${shimPath}`);
+      const bakedRoot = readShimBakedRoot(content);
+      if (bakedRoot && !shimBakedRootResolves(bakedRoot, { env, homeDir })) {
+        warn(`native shim baked root is stale: ${shimPath} -> ${bakedRoot}; re-run shell setup to refresh it`, { effective: false });
+      } else {
+        io.log(`[ok] native shim installed: ${shimPath}`);
+      }
     } else {
       warn(`native shim missing: ${shimPath}`);
     }
```

## Test changes in this cycle

`scripts/tests/aios-components.test.mjs` gains two local fixtures
(`plantManagedShim`, `makeLiveRuntimeRoot`) and three tests:

- `shell doctor warns when a managed shim baked root no longer resolves` (the RED slice)
- `shell doctor accepts a managed shim whose baked root resolves` (no false positive)
- `shell setup rewrites a managed shim with the current runtime root` (repair path)

No existing assertion was deleted, skipped, loosened, or retargeted.

## Real-machine observation (outside the test suite)

`doctorContextDbShell` against the real `C:\Users\Administrator\.aios\bin` after
the POSIX-shim repair reports `[ok] native shim installed` for all nine managed
shims and `baked root is stale` count `0`, confirming no false positive on the
repaired `${HOME}/.rexcil/aios` baked roots.
