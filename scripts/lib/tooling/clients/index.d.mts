/** Public contracts for the executable inventory and confirmed-update boundary. */
export type ClientId = 'claude' | 'codex' | 'pi' | 'gemini' | 'opencode' | 'hermes' | 'grok' | 'workbuddy' | 'zcode' | 'qoder';
export type ClientVersionStatus = 'ok' | 'missing' | 'unknown' | 'failed' | 'unrecognized' | 'unsupported';
export type ClientSourceKind = 'npm-global' | 'claude-native' | 'homebrew' | 'store' | 'unknown' | 'missing' | 'unsupported';

export interface ClientFileIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly size: string;
  readonly mode: string;
  readonly mtimeMs: string;
  readonly ctimeMs: string;
}

export interface ClientExecutable {
  readonly path: string;
  readonly realPath: string;
  readonly identity: ClientFileIdentity;
  readonly links: readonly { readonly path: string; readonly target: string; readonly identity: ClientFileIdentity }[];
}

export type ClientSourceEvidence =
  | { readonly type: 'package-metadata'; readonly path: string; readonly digest: string; readonly identity: ClientFileIdentity }
  | { readonly type: 'npm-global-layout'; readonly root: string; readonly prefix: string }
  | ({ readonly type: 'npm-runner' | 'node-runner' } & ClientExecutable)
  | { readonly type: 'native-layout-only'; readonly root: string };

export interface ClientInstallSource {
  readonly kind: ClientSourceKind;
  readonly supported: boolean;
  readonly reason: string | null;
  readonly evidence: readonly ClientSourceEvidence[];
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly prefix?: string;
  readonly runner?: { readonly node: string; readonly npm: string };
}

export interface ClientUpdateCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly shell: false;
}

export interface ClientInventory {
  readonly id: ClientId;
  /** null means inspection was inconclusive, not that the client is absent. */
  readonly installed: boolean | null;
  readonly executable: ClientExecutable | null;
  readonly version: string | null;
  readonly versionStatus: ClientVersionStatus;
  readonly source: ClientInstallSource;
  readonly inventorySupported: boolean;
  readonly update:
    | { readonly supported: true; readonly reason: null; readonly command: ClientUpdateCommand }
    | { readonly supported: false; readonly reason: string };
  readonly revision: string;
}

export interface ClientUpdatePreview {
  readonly client: ClientId;
  readonly supported: boolean;
  readonly reason: string | null;
  readonly source: ClientInstallSource;
  readonly evidence: readonly (ClientExecutable | ClientSourceEvidence)[];
  readonly revision: string;
  readonly evidenceHash: string;
  readonly command: ClientUpdateCommand | null;
  readonly requiresConfirmation: true;
  readonly version: string | null;
}

export interface ClientUpdateRequest {
  readonly client: ClientId;
  readonly confirm: true;
  readonly expectedRevision: string;
}

export interface ClientProcessOutput {
  readonly stdout: string;
  readonly stderr: string;
}

export interface ClientUpdateResult {
  readonly client: ClientId;
  readonly command: ClientUpdateCommand;
  readonly before: ClientInventory;
  readonly after: ClientInventory;
  /** False means the verified version was unchanged; success does not imply an upgrade. */
  readonly changed: boolean;
  readonly output: ClientProcessOutput;
}

export interface ClientManagementFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly lockRetained?: true;
    readonly output?: string;
  };
}

export type ClientManagementResponse = ClientManagementFailure
  | { readonly ok: true; readonly clients: readonly ClientInventory[] }
  | { readonly ok: true; readonly preview: ClientUpdatePreview }
  | { readonly ok: true; readonly result: ClientUpdateResult };

/** The minimum stat surface consumed by injected filesystem adapters. */
export interface ClientFileStat {
  readonly dev?: number | bigint | string;
  readonly ino?: number | bigint | string;
  readonly size: number;
  readonly mode?: number;
  readonly mtimeMs?: number;
  readonly ctimeMs?: number;
  isSymbolicLink(): boolean;
  isFile(): boolean;
}

export interface ClientMetadataHandle {
  stat(): Promise<ClientFileStat>;
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
}

export interface ClientFileSystem {
  lstat(path: string): Promise<ClientFileStat>;
  access(path: string, mode: number): Promise<void>;
  realpath(path: string): Promise<string>;
  readlink(path: string): Promise<string>;
  open(path: string, flags: 'r'): Promise<ClientMetadataHandle>;
  mkdir(path: string, options: { mode: number }): Promise<unknown>;
  rmdir(path: string): Promise<void>;
}

export interface ClientProcessOptions {
  readonly timeout: number;
  readonly maxBuffer: number;
  readonly shell: false;
  readonly windowsHide: true;
  readonly encoding: 'utf8';
  readonly killSignal: 'SIGKILL';
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface ClientRuntimeOptions {
  readonly fs?: ClientFileSystem;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: string;
  readonly home?: string;
  readonly cwd?: string;
  readonly nodePath?: string;
  readonly lockPath?: string;
  readonly resolveExecutable?: (name: string) => Promise<string | null>;
  readonly run?: (file: string, args: string[], options: ClientProcessOptions) => Promise<{ stdout?: string; stderr?: string; code?: number }>;
}

export interface ClientManager {
  inventory(): Promise<readonly ClientInventory[]>;
  previewUpdate(client: ClientId): Promise<ClientUpdatePreview>;
  updateClient(request: ClientUpdateRequest): Promise<ClientUpdateResult>;
}

export const CLIENT_IDS: readonly ClientId[];
export class ClientManagementError extends Error {
  readonly code: string;
  readonly output?: string;
  readonly lockRetained?: boolean;
  constructor(code: string, message: string, details?: { output?: string; lockRetained?: boolean });
}
export function redactClientOutput(value: unknown): string;
export function createClientManager(options?: ClientRuntimeOptions): ClientManager;
