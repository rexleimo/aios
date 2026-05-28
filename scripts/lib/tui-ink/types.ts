// scripts/lib/tui-ink/types.ts

export type WrapMode = 'all' | 'repo-only' | 'opt-in' | 'off';
export type Scope = 'global' | 'project';
export type Client = 'all' | 'codex' | 'claude' | 'gemini' | 'opencode';
export type Action = 'setup' | 'update' | 'uninstall' | 'doctor';

export interface ComponentsConfig {
  browser: boolean;
  shell: boolean;
  skills: boolean;
  native: boolean;
  superpowers: boolean;
}

export interface SetupOptions {
  components: ComponentsConfig;
  wrapMode: WrapMode;
  scope: Scope;
  client: Client;
  selectedSkills: string[];
  skipPlaywrightInstall: boolean;
  skipDoctor: boolean;
}

export interface UpdateOptions {
  components: ComponentsConfig;
  wrapMode: WrapMode;
  scope: Scope;
  client: Client;
  selectedSkills: string[];
  withPlaywrightInstall: boolean;
  skipDoctor: boolean;
}

export interface UninstallOptions {
  components: ComponentsConfig;
  scope: Scope;
  client: Client;
  selectedSkills: string[];
}

export interface DoctorOptions {
  strict: boolean;
  globalSecurity: boolean;
  nativeOnly: boolean;
  verbose: boolean;
  fix: boolean;
  dryRun: boolean;
}

export interface CatalogSkill {
  name: string;
  description?: string;
  clients: Client[];
  scopes: Scope[];
  defaultInstall?: {
    global?: boolean;
    project?: boolean;
  };
}

// Alias for consistency with catalog naming
export type CatalogSkillAlias = CatalogSkill;

export interface InstalledSkills {
  global: Record<Client, string[]>;
  project: Record<Client, string[]>;
}

export interface AllOptions {
  setup: SetupOptions;
  update: UpdateOptions;
  uninstall: UninstallOptions;
  doctor: DoctorOptions;
}

export interface RunRequest {
  action: Action;
  options: SetupOptions | UpdateOptions | UninstallOptions | DoctorOptions;
}

export interface TuiSessionProps {
  rootDir: string;
  catalogSkills: CatalogSkill[];
  installedSkills: InstalledSkills;
  onRefreshInstalled: () => InstalledSkills;
  onRun: (action: Action, options: unknown, hooks?: { onLog?: (line: string) => void }) => Promise<void>;
}
