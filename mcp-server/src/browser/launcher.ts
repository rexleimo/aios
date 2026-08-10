// mcp-server/src/browser/launcher.ts
import { chromium, type Browser, type BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import type { BrowserProfile, ProfileState } from './types.js';
import { profileManager } from './profiles.js';
import { STEALTH_SCRIPT } from './stealth-script.js';

// 反检测启动参数
const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--disable-browser-side-navigation',
  '--disable-web-security',
  '--disable-features=VizDisplayCompositor',
  '--ignore-certificate-errors',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-sync',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--disable-crash-reporter',
  '--disable-breakpad',
];

// 通过 assistantMode: true 已经移除了 --enable-automation，此处保留 IGNORE_DEFAULT_ARGS
// 作为防御性配置，防止 Playwright 版本升级后行为变化。
const IGNORE_DEFAULT_ARGS = ['--enable-automation'];

// STEALTH_SCRIPT 已移至 stealth-script.ts，通过 import 导入

function parseHeadlessEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export function resolveRequireCdp(
  profile: BrowserProfile,
  envValue: string | undefined
): boolean {
  if (typeof profile.requireCdp === 'boolean') {
    return profile.requireCdp;
  }

  return parseBooleanEnv(envValue) ?? false;
}

export function resolveLaunchHeadless(
  options: { headless?: boolean; visible?: boolean },
  profile: BrowserProfile,
  envValue: string | undefined
): { headless: boolean; visible: boolean; source: 'arg-visible' | 'arg-headless' | 'profile-headless' | 'env-headless' | 'default-visible' } {
  if (typeof options.visible === 'boolean') {
    return {
      headless: !options.visible,
      visible: options.visible,
      source: 'arg-visible',
    };
  }

  if (typeof options.headless === 'boolean') {
    return {
      headless: options.headless,
      visible: !options.headless,
      source: 'arg-headless',
    };
  }

  if (typeof profile.headless === 'boolean') {
    return {
      headless: profile.headless,
      visible: !profile.headless,
      source: 'profile-headless',
    };
  }

  const envHeadless = parseHeadlessEnv(envValue);
  if (typeof envHeadless === 'boolean') {
    return {
      headless: envHeadless,
      visible: !envHeadless,
      source: 'env-headless',
    };
  }

  return {
    headless: false,
    visible: true,
    source: 'default-visible',
  };
}

function resolveExecutablePath(profile: BrowserProfile): string | undefined {
  if (profile.executablePath) return profile.executablePath;
  if (process.env.BROWSER_EXECUTABLE_PATH) return process.env.BROWSER_EXECUTABLE_PATH;

  if (process.platform === 'darwin') {
    const macCandidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Arc.app/Contents/MacOS/Arc',
      '/opt/homebrew/bin/chromium',
      '/usr/local/bin/chromium',
    ];
    for (const candidate of macCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  if (process.platform === 'win32') {
    const winCandidates = [
      path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(process.env['LOCALAPPDATA'] || '', 'Chromium\\Application\\chrome.exe'),
      path.join(process.env['LOCALAPPDATA'] || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome SxS\\Application\\chrome.exe'),
    ];
    for (const candidate of winCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  if (process.platform === 'linux') {
    const linuxCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome-beta',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/brave-browser',
      '/usr/bin/vivaldi',
      '/usr/bin/opera',
      '/snap/bin/chromium',
      '/snap/bin/brave',
      '/var/lib/flatpak/exports/bin/org.chromium.Chromium',
      '/var/lib/flatpak/exports/bin/com.brave.Browser',
      '/var/lib/flatpak/exports/bin/com.google.Chrome',
      '/var/lib/flatpak/exports/bin/com.microsoft.Edge',
    ];
    for (const candidate of linuxCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

function resolveIsolateOnLock(profile: BrowserProfile, envValue: string | undefined): boolean {
  if (typeof profile.isolateOnLock === 'boolean') return profile.isolateOnLock;
  return parseBooleanEnv(envValue) ?? true;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const USER_DATA_DIR_LOCK_PATTERNS: RegExp[] = [
  /existing browser session/i,
  /opening in existing browser session/i,
  /profile appears to be in use/i,
  /user data directory is already in use/i,
  /already in use by another/i,
  /processsingleton/i,
  /singletonlock/i,
  /正在现有的浏览器会话中打开/,
];

export function isUserDataDirLockedError(error: unknown): boolean {
  const message = toErrorMessage(error);
  return USER_DATA_DIR_LOCK_PATTERNS.some((pattern) => pattern.test(message));
}

function createIsolatedUserDataDir(baseUserDataDir: string, profileName: string): string {
  const sanitized = profileName.replace(/[^a-z0-9._-]/gi, '_').toLowerCase() || 'profile';
  const isolatedRoot = path.join(path.dirname(baseUserDataDir), '.isolated');
  fs.mkdirSync(isolatedRoot, { recursive: true });
  const mkdtempPrefix = path.join(isolatedRoot, `${sanitized}-${process.pid}-`);
  return fs.mkdtempSync(mkdtempPrefix);
}

interface LaunchPersistentResult {
  context: BrowserContext;
  userDataDir: string;
  isolated: boolean;
}

export class BrowserLauncher {
  private state: Map<string, ProfileState> = new Map();
  private _pageIdCounter = 0;
  private profileInitPromise: Promise<void> | null = null;

  private async ensureProfilesLoaded(): Promise<void> {
    if (!this.profileInitPromise) {
      this.profileInitPromise = profileManager.init();
    }
    await this.profileInitPromise;
  }

  get pageIdCounter(): number {
    return this._pageIdCounter;
  }

  set pageIdCounter(value: number) {
    this._pageIdCounter = value;
  }

  private async launchPersistentContextWithIsolation(
    profileName: string,
    userDataDir: string,
    options: {
      headless: boolean;
      executablePath?: string;
      isolateOnLock: boolean;
    }
  ): Promise<LaunchPersistentResult> {
    const launchOptions = {
      headless: options.headless,
      args: STEALTH_ARGS,
      ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
      executablePath: options.executablePath,
      viewport: { width: 1280, height: 720 },
      // assistantMode: true 禁用 AutomationControlled 特性并移除 --enable-automation，
      // 使 navigator.webdriver 从一开始就是 false，无需依赖 JS timing hack。
      // channel: 'chrome' 只影响 infobar，与自动化标志无关，已废弃。
      // @ts-ignore - assistantMode 是 Playwright 内部选项，未暴露在 TypeScript 类型中
      assistantMode: true,
    };

    try {
      const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
      return { context, userDataDir, isolated: false };
    } catch (firstError) {
      if (!options.isolateOnLock || !isUserDataDirLockedError(firstError)) {
        throw firstError;
      }

      const isolatedUserDataDir = createIsolatedUserDataDir(userDataDir, profileName);
      const firstReason = toErrorMessage(firstError);
      console.error(
        `[browser_launch] profile "${profileName}" userDataDir in use (${userDataDir}), retry with isolated dir: ${isolatedUserDataDir}. reason=${firstReason}`
      );

      const context = await chromium.launchPersistentContext(isolatedUserDataDir, launchOptions);
      return { context, userDataDir: isolatedUserDataDir, isolated: true };
    }
  }

  async launch(profileName: string = 'default', url?: string, headless?: boolean, visible?: boolean): Promise<ProfileState> {
    await this.ensureProfilesLoaded();

    if (this.state.has(profileName)) {
      const existing = this.state.get(profileName)!;
      if (existing.browser?.isConnected()) {
        existing.lastUsedAt = Date.now();
        return existing;
      }
    }

    const profile = profileManager.getProfile(profileName) || { name: profileName };
    const profileDir = profileManager.getProfileDir(profileName);

    // 确保 profile 目录存在
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // 使用配置的用户数据目录（用于保存登录状态）
    const baseUserDataDir = profile.userDataDir
      ? profileManager.resolveWorkspacePath(profile.userDataDir)
      : profileDir;

    const launchPreference = resolveLaunchHeadless({ headless, visible }, profile, process.env.BROWSER_HEADLESS);
    const resolvedHeadless = launchPreference.headless;
    const requireCdp = resolveRequireCdp(profile, process.env.BROWSER_REQUIRE_CDP);
    const isolateOnLock = resolveIsolateOnLock(profile, process.env.BROWSER_ISOLATE_ON_LOCK);
    const executablePath = resolveExecutablePath(profile);
    const cdpEndpoint = profile.cdpUrl || (profile.cdpPort ? `http://127.0.0.1:${profile.cdpPort}` : undefined);

    if (requireCdp && !cdpEndpoint) {
      throw new Error(
        `Profile "${profileName}" requires a fingerprint browser CDP connection, ` +
        'but no cdpUrl/cdpPort is configured in config/browser-profiles.json.'
      );
    }

    let browser: Browser;
    let context: BrowserContext;
    let connectedOverCdp = false;
    let launchMode: ProfileState['launchMode'] = 'ephemeral-local';
    let effectiveProfile = profileName;
    let userDataDir = baseUserDataDir;
    let isolated = false;

    try {
      // 优先支持指纹浏览器/CDP 接入，避免本地启动 Chrome for Testing 崩溃。
      if (cdpEndpoint) {
        try {
          browser = await chromium.connectOverCDP(cdpEndpoint);
          connectedOverCdp = true;
          launchMode = 'cdp';
          const contexts = browser.contexts();
          context = contexts.length > 0
            ? contexts[0]
            : await browser.newContext({ viewport: { width: 1280, height: 720 } });
        } catch (cdpError) {
          if (requireCdp || profileName !== 'default') {
            throw cdpError;
          }

          // 仅在显式允许回退时，对 default profile 自动降级到 local。
          const fallbackProfile = profileManager.getProfile('local') || { name: 'local', userDataDir: '.browser-profiles/local' };
          const fallbackUserDataDir = fallbackProfile.userDataDir
            ? profileManager.resolveWorkspacePath(fallbackProfile.userDataDir)
            : profileManager.getProfileDir('local');
          const fallbackExecutablePath = resolveExecutablePath(fallbackProfile);
          const fallbackLaunch = await this.launchPersistentContextWithIsolation('local', fallbackUserDataDir, {
            headless: resolvedHeadless,
            executablePath: fallbackExecutablePath,
            isolateOnLock,
          });
          context = fallbackLaunch.context;
          browser = context.browser()!;
          launchMode = fallbackLaunch.isolated ? 'persistent-local-fallback-isolated' : 'persistent-local-fallback';
          effectiveProfile = 'local';
          userDataDir = fallbackLaunch.userDataDir;
          isolated = fallbackLaunch.isolated;

          const reason = toErrorMessage(cdpError);
          console.error(
            `[browser_launch] default profile cdp fallback -> local. reason=${reason}`
          );
        }
      } else if (baseUserDataDir) {
        // 使用 launchPersistentContext 来支持 userDataDir（持久化登录状态）
        const persistentLaunch = await this.launchPersistentContextWithIsolation(profileName, baseUserDataDir, {
          headless: resolvedHeadless,
          executablePath,
          isolateOnLock,
        });
        context = persistentLaunch.context;
        browser = context.browser()!;
        launchMode = persistentLaunch.isolated ? 'persistent-local-isolated' : 'persistent-local';
        userDataDir = persistentLaunch.userDataDir;
        isolated = persistentLaunch.isolated;
      } else {
        browser = await chromium.launch({
          headless: resolvedHeadless,
          args: STEALTH_ARGS,
          ignoreDefaultArgs: IGNORE_DEFAULT_ARGS,
          executablePath,
          // @ts-ignore - assistantMode 是 Playwright 内部选项
          assistantMode: true,
        });
        context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
        });
        launchMode = 'ephemeral-local';
      }
    } catch (error) {
      const reason = toErrorMessage(error);
      const tips = [
        `profile=${profileName}`,
        cdpEndpoint ? `cdp=${cdpEndpoint}` : 'cdp=disabled',
        `headless=${String(resolvedHeadless)}`,
        `isolateOnLock=${String(isolateOnLock)}`,
        `userDataDir=${baseUserDataDir}`,
        executablePath ? `executablePath=${executablePath}` : 'executablePath=playwright-default',
      ].join(', ');
      throw new Error(
        `Browser launch failed (${tips}). ${reason}\n` +
        `建议：在 config/browser-profiles.json 为该 profile 配置 cdpUrl/cdpPort（连接指纹浏览器）` +
        `或 executablePath（系统浏览器路径）。`
      );
    }

    // 注入反检测脚本
    await context.addInitScript(STEALTH_SCRIPT);

    const state: ProfileState = {
      browser,
      context,
      pages: new Map(),
      activePageId: null,
      connectedOverCdp,
      headless: resolvedHeadless,
      visible: launchPreference.visible,
      launchMode,
      requestedProfile: profileName,
      effectiveProfile,
      userDataDir,
      baseUserDataDir,
      isolated,
      lastUsedAt: Date.now(),
    };

    this.state.set(profileName, state);

    // 创建第一个页面
    if (url) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      const pageId = ++this._pageIdCounter;
      state.pages.set(pageId, page);
      state.activePageId = pageId;
    }

    return state;
  }

  getState(profileName: string): ProfileState | undefined {
    const state = this.state.get(profileName);
    if (state) state.lastUsedAt = Date.now();
    return state;
  }

  getActivePage(profileName: string) {
    const state = this.getState(profileName);
    if (!state || state.activePageId === null) return null;
    return state.pages.get(state.activePageId);
  }

  async close(profileName: string): Promise<void> {
    const state = this.state.get(profileName);
    if (!state) return;

    const closeErrors: unknown[] = [];

    if (state.connectedOverCdp) {
      // CDP 模式下 close() 只断开连接，不关闭外部浏览器进程。
      try {
        await state.browser?.close();
      } catch (error) {
        closeErrors.push(error);
      }
    } else {
      if (state.context) {
        try {
          await state.context.close();
        } catch (error) {
          closeErrors.push(error);
        }
      }
      if (state.browser) {
        try {
          await state.browser.close();
        } catch (error) {
          closeErrors.push(error);
        }
      }
    }

    if (state.isolated && state.userDataDir?.includes(`${path.sep}.isolated${path.sep}`)) {
      try {
        fs.rmSync(state.userDataDir, { recursive: true, force: true });
      } catch (cleanupError) {
        const reason = toErrorMessage(cleanupError);
        console.error(`[browser_close] failed to cleanup isolated profile dir: ${state.userDataDir}. reason=${reason}`);
      }
    }

    this.state.delete(profileName);
    if (closeErrors.length > 0) throw closeErrors[0];
  }

  async closeIdle(maxIdleMs: number, now: number = Date.now()): Promise<string[]> {
    if (!Number.isFinite(maxIdleMs) || maxIdleMs <= 0) return [];
    const expired = [...this.state.entries()]
      .filter(([, state]) => now - state.lastUsedAt >= maxIdleMs)
      .map(([profileName]) => profileName);

    for (const profileName of expired) {
      try {
        await this.close(profileName);
      } catch (error) {
        console.error(`[browser_idle_cleanup] failed to close profile ${profileName}: ${toErrorMessage(error)}`);
      }
    }
    return expired;
  }

  async closeAll(): Promise<string[]> {
    const profiles = [...this.state.keys()];
    for (const profileName of profiles) {
      try {
        await this.close(profileName);
      } catch (error) {
        console.error(`[browser_shutdown] failed to close profile ${profileName}: ${toErrorMessage(error)}`);
      }
    }
    return profiles;
  }
}

export const browserLauncher = new BrowserLauncher();
