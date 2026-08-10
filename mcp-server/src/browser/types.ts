// mcp-server/src/browser/types.ts
import type { Browser, BrowserContext, Page, Locator } from 'playwright';

export interface BrowserProfile {
  name: string;
  cdpPort?: number;
  cdpUrl?: string;
  color?: string;
  executablePath?: string;
  userDataDir?: string;
  headless?: boolean;
  requireCdp?: boolean;
  isolateOnLock?: boolean;
}

export interface ProfileState {
  browser: Browser | null;
  context: BrowserContext | null;
  pages: Map<number, Page>;
  activePageId: number | null;
  connectedOverCdp?: boolean;
  headless?: boolean;
  visible?: boolean;
  launchMode?:
    | 'cdp'
    | 'persistent-local'
    | 'persistent-local-isolated'
    | 'persistent-local-fallback'
    | 'persistent-local-fallback-isolated'
    | 'ephemeral-local';
  requestedProfile?: string;
  effectiveProfile?: string;
  userDataDir?: string;
  baseUserDataDir?: string;
  isolated?: boolean;
  lastUsedAt: number;
}

export interface BrowserState {
  profiles: Map<string, ProfileState>;
  activeProfile: string | null;
}

export interface LaunchOptions {
  headless?: boolean;
  visible?: boolean;
  profile?: string;
  url?: string;
}

export interface NavigateOptions {
  url: string;
  profile?: string;
}

export interface ClickOptions {
  selector: string;
  profile?: string;
  double?: boolean;
}

export interface TypeOptions {
  selector: string;
  text: string;
  profile?: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  profile?: string;
}
