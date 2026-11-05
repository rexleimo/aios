// The gate in front of every request the shell's page receives.
//
// The decision itself lives in `lib/trust.mjs` so it can be asserted without a
// server; this file only translates it into HTTP. See that module for why the checks
// are ordered the way they are.
//
// Next 16 renamed the `middleware` file convention to `proxy` (the old name is
// deprecated), and this file is at the root of `src/` because that is where it must
// sit relative to `app/`.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { TOKEN_COOKIE, decide } from './lib/trust.mjs';

const TOKEN = process.env.AIOS_UI_TOKEN ?? '';
const PORT = Number(process.env.AIOS_UI_PORT ?? '') || 0;

function deny(reason: string): NextResponse {
  // 403 with the reason in a header, not a 404: a probe should not have to guess
  // whether it hit the wrong path or the wrong token, and the reason is not a secret.
  const response = new NextResponse(`forbidden: ${reason}\n`, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-aios-deny': reason },
  });
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const decision = decide(
    {
      pathname: request.nextUrl.pathname,
      cookie: request.cookies.get(TOKEN_COOKIE)?.value ?? null,
      origin: request.headers.get('origin'),
      secFetchSite: request.headers.get('sec-fetch-site'),
    },
    { token: TOKEN, port: PORT },
  );

  if (decision.action === 'deny') {
    return deny(decision.reason);
  }

  if (decision.action === 'bootstrap') {
    const target = request.nextUrl.clone();
    target.pathname = '/';
    target.search = '';
    const response = NextResponse.redirect(target, 307);
    response.cookies.set({
      name: TOKEN_COOKIE,
      value: TOKEN,
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      // Loopback over plain http: `secure` would make the cookie undeliverable.
      secure: false,
    });
    return response;
  }

  return NextResponse.next();
}
