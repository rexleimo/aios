import type { BrowserProfile, ProfileState } from './types.js';
import { browserLauncher } from './launcher.js';
import { profileManager } from './profiles.js';

export interface BrowserHealthProfile {
  name: string;
  userDataDir: string | null;
  cdpEndpoint: string | null;
  cdpConfigured: boolean;
  running: boolean;
  connectedOverCdp: boolean;
  launchMode: ProfileState['launchMode'] | null;
}

export interface BrowserHealth {
  ok: true;
  browserReady: boolean;
  server: {
    name: string;
    version: string;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    workspaceRoot: string;
  };
  profiles: BrowserHealthProfile[];
  recommendations: string[];
}

function resolveCdpEndpoint(profile: BrowserProfile): string | null {
  if (profile.cdpUrl) return profile.cdpUrl;
  if (profile.cdpPort) return `http://127.0.0.1:${profile.cdpPort}`;
  return null;
}

function isBrowserConnected(state: ProfileState | undefined): boolean {
  return Boolean(state?.browser && state.browser.isConnected());
}

export function buildBrowserHealth({
  profiles = [],
  states = new Map<string, ProfileState>(),
  workspaceRoot = process.cwd(),
  platform = process.platform,
  nodeVersion = process.version,
}: {
  profiles?: Array<[string, BrowserProfile]>;
  states?: Map<string, ProfileState>;
  workspaceRoot?: string;
  platform?: string;
  nodeVersion?: string;
} = {}): BrowserHealth {
  const profileRows = profiles.map(([name, profile]) => {
    const state = states.get(name);
    const cdpEndpoint = resolveCdpEndpoint(profile);
    return {
      name,
      userDataDir: profile.userDataDir ?? null,
      cdpEndpoint,
      cdpConfigured: Boolean(cdpEndpoint),
      running: isBrowserConnected(state),
      connectedOverCdp: state?.connectedOverCdp === true,
      launchMode: state?.launchMode ?? null,
    } satisfies BrowserHealthProfile;
  });

  const recommendations: string[] = [];
  if (profileRows.length === 0) {
    recommendations.push('No configured profiles; browser_launch will use the default local profile.');
  }
  if (profileRows.some((profile) => profile.cdpConfigured && !profile.running)) {
    recommendations.push('A CDP profile is configured but not running; launch or connect the browser before using it.');
  }

  return {
    ok: true,
    browserReady: profileRows.some((profile) => profile.running),
    server: {
      name: 'aios-browser-mcp',
      version: '1.0.0',
    },
    runtime: {
      nodeVersion,
      platform,
      workspaceRoot,
    },
    profiles: profileRows,
    recommendations,
  };
}

export async function getBrowserHealth(): Promise<BrowserHealth> {
  await profileManager.init();
  const profiles = [...profileManager.getAllProfiles().entries()];
  const states = new Map<string, ProfileState>();
  for (const [name] of profiles) {
    const state = browserLauncher.getState(name);
    if (state) states.set(name, state);
  }

  return buildBrowserHealth({
    profiles,
    states,
    workspaceRoot: profileManager.getWorkspaceRoot(),
  });
}
