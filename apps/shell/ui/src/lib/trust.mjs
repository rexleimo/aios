// The local trust boundary for the shell's page.
//
// The page is served on loopback, so "only this machine can reach it" is not a
// boundary — every process and every browser tab on this machine is on this machine.
// What the boundary has to stop is another *origin* driving this one: a page that
// can read the matrix today can trigger actions tomorrow.
//
// Three checks, in this order, and the order matters:
//
// 1. A request with no declared token is refused before anything else. "No token
//    configured" must not degrade into "no gate"; a shell that quietly serves an
//    ungated page is worse than one that fails to start.
// 2. A cross-site request is refused even if it carries the cookie. `SameSite` is
//    not enough on its own: browsers treat different ports on the same host as the
//    same site, so a page on 127.0.0.1:8080 would still receive the cookie.
// 3. A request with a foreign `Origin` is refused. This is the check that survives
//    DNS rebinding, because the rebound page sends its own origin, not ours.
//
// Then, and only then, the token: the first hit on `/t/<token>/` exchanges the token
// for an HttpOnly cookie and redirects, so asset requests (which cannot carry a
// query string) still authenticate.
//
// The token comparisons are plain string equality. A constant-time compare would
// suggest an attacker can use timing as an oracle across loopback; the real defence
// is that the token is 128 bits of randomness and is only published to a file in the
// user's own volatile directory.
export const TOKEN_COOKIE = 'aios_ui_token';
export const TOKEN_PATH_PREFIX = '/t/';

/** Loopback hosts the shell may be reached on. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * The port an `Origin` header names, or `null` when it does not parse.
 * @param {string} origin
 * @returns {{ host: string, port: number } | null}
 */
export function parseOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : parsed.protocol === 'http:'
        ? 80
        : 0;
  return { host: parsed.hostname, port };
}

/**
 * Whether an `Origin` names this very page.
 * @param {string} origin
 * @param {number} port
 */
export function isSelfOrigin(origin, port) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return LOOPBACK_HOSTS.has(parsed.host) && parsed.port === port;
}

/**
 * One decision per request. Pure: no headers object, no Next, no I/O, so the table
 * of cases can be asserted without starting a server.
 *
 * @param {{ pathname: string, cookie?: string | null, origin?: string | null, secFetchSite?: string | null }} request
 * @param {{ token: string, port: number }} options
 * @returns {{ action: 'deny' | 'bootstrap' | 'allow', reason: string }}
 */
export function decide(request, options) {
  const token = String(options?.token ?? '');
  const port = Number(options?.port ?? 0);

  if (token.length === 0) {
    return { action: 'deny', reason: 'no-token-configured' };
  }
  if (request?.secFetchSite === 'cross-site') {
    return { action: 'deny', reason: 'cross-site' };
  }
  const origin = request?.origin ?? null;
  if (origin && !isSelfOrigin(origin, port)) {
    return { action: 'deny', reason: 'foreign-origin' };
  }

  const pathname = String(request?.pathname ?? '/');
  if (pathname === `${TOKEN_PATH_PREFIX}${token}` || pathname === `${TOKEN_PATH_PREFIX}${token}/`) {
    return { action: 'bootstrap', reason: 'token-exchange' };
  }
  if (request?.cookie === token) {
    return { action: 'allow', reason: 'cookie' };
  }
  return { action: 'deny', reason: 'missing-token' };
}

/**
 * The URL the window opens: the token exchange, which redirects to the page itself.
 * Kept here so the launcher, the window and the test all name the same shape.
 * @param {number} port
 * @param {string} token
 */
export function bootstrapUrl(port, token) {
  return `http://127.0.0.1:${port}${TOKEN_PATH_PREFIX}${token}/`;
}
