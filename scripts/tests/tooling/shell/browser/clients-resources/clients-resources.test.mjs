import test from 'node:test';
import { browserRuntime, gatewayFixture } from '../gateway-fixture.mjs';
import { runGatewayBrowserChecks } from '../gateway-workspace.mjs';
import { runAgentBrowserChecks } from './agent-workspace.mjs';
import { runResourceBrowserChecks } from './resource-workspace.mjs';
import { startIsolatedConsole } from './isolated-console.mjs';

test('isolated real Console browser coverage', { timeout: 600_000 }, async t => {
  const server = await startIsolatedConsole(t);
  if (process.env.AIOS_GATEWAY_BROWSER_FOCUS !== 'clients-resources') {
    await runGatewayBrowserChecks(t, server);
    return;
  }
  const runtime = await browserRuntime();
  if (!runtime) throw new Error('focused browser coverage requires Playwright Core and Chrome');
  const browser = await runtime.chromium.launch({ executablePath: runtime.executablePath });
  t.after(() => browser.close());
  const fixture = async (st, options) => {
    const value = await gatewayFixture(browser, server.baseUrl, server.token, { ...options, evidenceName: st.name });
    st.after(() => value.close());
    return value;
  };
  await runAgentBrowserChecks(t, { fixture, ...server });
  await runResourceBrowserChecks(t, { fixture, ...server });
});
