---
title: トラブルシューティング
description: よくあるセットアップ/ランタイムの問題と直接的な修正方法。
---

# トラブルシューティング

## クイックアンサー（AI 検索）

ほとんどの失敗はセットアップの問題です（MCP ランタイムがない、wrapper がロードされていない、あるいは誤った wrap モード）。まず doctor スクリプトを実行し、wrapper のスコープを確認してください。

## ContextDB が Node 切り替え後に失敗

Harness CLI は **Node 24 LTS** を前提としており、ContextDB は Node 組み込みの `node:sqlite` を使用します。外部 SQLite native addon の rebuild は不要です。

`Unable to resolve a Node runtime matching .nvmrc=24` または `[node-version] AIOS requires Node 24.x LTS` が出た場合は、まず Node 24 をインストールしてから再試行してください。

素早い修正:

```bash
node -v
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
cd mcp-server && npm run test:contextdb
```

リトライ:

```bash
npm run test:scripts
```

## Browser MCP ツールが利用不可

**大半の場合**: Playwright MCP がインストールされていないか、`~/.config/codex/` (または `~/.config/claude/` etc.) の MCP 設定に `puppeteer-stealth` エイリアスがない。

Doctor スクリプトで確認してください:

=== "macOS / Linux"

    ```bash
    scripts/doctor-browser-mcp.sh
    ```

=== "Windows (PowerShell)"

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\doctor-browser-mcp.ps1
    ```

または手動で `~/.config/codex/mcp.json` (または `~/.config/claude/settings.json` for Claude Code, `~/.gemini/mcp.json` for Gemini CLI) を開き、以下が含まれていることを確認してください:

```json
{
  "mcpServers": {
    "puppeteer-stealth": {
      "command": "node",
      "args": ["/path/to/harness-cli/mcp-server/dist/puppeteer-stealth-server.js"]
    }
  }
}
```

## `EXTRA_ARGS[@]: unbound variable`

原因: 旧 `ctx-agent.sh` で `bash set -u` の空配列展開の境界ケースによるエラー。

修復:

1. 最新 `main` を pull。
2. Shell を再起動して `claude`/`codex`/`gemini` を再実行。

最新バージョンは unified ランタイムコア（`ctx-agent-core.mjs`）を使用して、sh/mjs 実装間のドリフトを解消しています。

## `search` がサイドカー損失後に空になる

`.aios/context-db/index/context.db` がない場合または古い場合:

1. `cd mcp-server && npm run contextdb -- index:rebuild` を実行
2. `search` / `timeline` / `event:get` を再実行

## `contextdb context:pack failed`

`contextdb context:pack` が失敗した場合、`ctx-agent` は **警告して続行** します (コンテキスト未注入で CLI を起動)。

パック失敗を致命的エラーにする場合:

```bash
export CTXDB_PACK_STRICT=1
```

シェルラッパー (`codex`/`claude`/`gemini`) は対話セッションの破損を避けるため、`CTXDB_PACK_STRICT=1` を設定してもデフォルトは fail-open です。対話ラップも厳格化する場合:

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

頻発する場合は、品質ゲート (ContextDB 回帰チェックを含む) を実行してください:

```bash
aios quality-gate pre-pr --profile strict
```

## `/new` (Codex) / `/clear` (Claude/Gemini) 後にコンテキストが消える

これらのコマンドは **CLI 内の会話状態** をリセットします。ContextDB はディスク上に残りますが、ラッパーがコンテキストパケットを注入するのは **CLI プロセス起動時のみ** です。

復帰方法:

- 推奨: CLI を終了し、シェルから `codex` / `claude` / `gemini` を再実行。
- 同一プロセスで続けたい場合: 新しい会話の最初に最新スナップショットを読ませる:
  - `@.aios/context-db/exports/latest-codex-cli-context.md`
  - `@.aios/context-db/exports/latest-claude-code-context.md`
  - `@.aios/context-db/exports/latest-gemini-cli-context.md`

クライアントが `@file` 参照をサポートしない場合は、ファイル内容を最初のプロンプトとして貼り付けてください。

## `aios orchestrate --execute live` がブロック/失敗する

ライブオーケストレーションはオプトインです。

1. ライブ実行ゲートを有効化:

```bash
export AIOS_EXECUTE_LIVE=1
```

2. codex-cli 専用サブエージェントクライアントを設定（必須）:

```bash
export AIOS_SUBAGENT_CLIENT=codex-cli
```

3. `codex` が PATH 上にあり、認証済みであることを確認（例: `codex --version`）。

Windows クイックチェック (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
codex --version
codex
```

期待動作: TTY エラー（`stdout is not a terminal` など）がなく、インタラクティブな `codex` セッションがターミナルに正しくアタッチされる。

ヒント (codex-cli): Codex CLI v0.114+ は `codex exec` 構造化出力をサポート（`--output-schema`、`--output-last-message`、stdin）。AIOS は利用可能な場合、安定した JSON handoff のためにこれらを使用します。Codex child worker は既定で `--dangerously-bypass-approvals-and-sandbox` を付与し、unattended live run が approval/sandbox prompt で待ち続けるのを防ぎます。手動デバッグ時のみ `AIOS_SUBAGENT_CODEX_UNATTENDED=0` で無効化してください。

もし routed startup が current の non-AIOS repo 内で `scripts/aios.mjs` を探し続ける場合は、最新 `main` を pull してください。最近の build では routed `ctx-agent` startup が source-repo レイアウトを前提にせず、workspace-aware に動作します。

ヒント: モデルコールなしで DAG を検証するには、`--execute dry-run` を使用（またはライブランタイム adapter シミュレーション用に `AIOS_SUBAGENT_SIMULATE=1`）。

よくある失敗パターン:

- `type: upstream_error` / `server_error`: 上流の不安定。稍后再试（AIOS は自動的に数回リトライ）。
- `Timed out after 600000 ms`: `AIOS_SUBAGENT_TIMEOUT_MS` を増加（例 `900000`）、またはコンテキストパックを `AIOS_SUBAGENT_CONTEXT_LIMIT` / `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET` で縮小。
- `invalid_json_schema` (`param: text.format.schema`): バックエンドが構造化出力スキーマを拒否。最新 `main` を pull して再試行。AIOS はスキーマ拒否を検出すると `--output-schema` なしでリトライ。

最小構造化出力スモークチェック (macOS/Linux):

```bash
printf '%s' 'Return a JSON object matching the schema.' | codex exec --output-schema scripts/lib/specs/agent-handoff.schema.json -
```

## コマンドがラップされていない

ラップされていない場合:

- git レポジトリ内有か確認: `git rev-parse --show-toplevel` が動作すること
- `ROOTPATH/scripts/contextdb-shell.zsh` が存在し、source されていることを確認
- `CTXDB_WRAP_MODE` が現在のレポジトリを許可しているか確認（`opt-in` の場合は `.contextdb-enable` が必要）

まずラッパー doctor を実行:

```bash
scripts/doctor-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
```

## `CODEX_HOME points to ".codex"` エラー

原因: `CODEX_HOME` が相対パスに設定されている。

修復:

```bash
export CODEX_HOME="$HOME/.codex"
mkdir -p "$CODEX_HOME"
```

最新ラッパースクリプトはコマンド実行時に相対 `CODEX_HOME` を自動的に正規化します。

## ラッパーがロードされたが、無効化したい

恒久的に無効にするには:

```zsh
export CTXDB_WRAP_MODE=off
```

## Skills が誤ったレポジトリディレクトリに保存された

canonical skill source tree は以下に置かれるようになりました:

- `<repo>/skill-sources`

生成された repo-local 検出可能出力は以下の場所にあります:

- `<repo>/.codex/skills`
- `<repo>/.claude/skills`

`SKILL.md` を `.baoyu-skills/` のような並行ディレクトリに保存すると、Codex / Claude はそれをスキルとして検出できません。

- `.baoyu-skills/` は `EXTEND.md` のような拡張設定のみに使用
- 本来のスキルソースファイルは `skill-sources/<name>/SKILL.md` に移動
- `node scripts/sync-skills.mjs` で各クライアントの互換ディレクトリを再生成
- `scripts/doctor-contextdb-skills.sh --client all` で未対応のスキルルートディレクトリを検出

## `--scope project` が Harness CLI ソースレポ内で失敗する

canonical skill source tree の移行後に発生します。これは意図的な動作です:

- `skill-sources/` がオーサリングツリー
- repo-local の `.codex/skills` / `.claude/skills` / `.agents/skills` は sync 管理の生成ディレクトリ
- ソースレポ自身への `--scope project` インストールは意図的にブロック済み

代わりに以下を実行してください:

```bash
node scripts/sync-skills.mjs
node scripts/check-skills-sync.mjs
```

他のプロジェクトに skills をインストールしたい場合は、そのワークスペースに切り替えてから `aios ... --scope project` を実行してください。

## レポ skills が他プロジェクトでグローバル利用不可

ラッパーと skills は別々に設計されています。明示的に skills をインストールしてください。`--client all` は `codex` / `claude` / `gemini` / `opencode` を対象にします。

=== "macOS / Linux"

    ```bash
    scripts/install-contextdb-skills.sh --client all
    scripts/doctor-contextdb-skills.sh --client all
    ```

=== "Windows (PowerShell)"

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\install-contextdb-skills.ps1 -Client all
    powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-skills.ps1 -Client all
    ```

## GitHub Pages `configure-pages` が見つからない

これは通常 Pages ソースが完全に有効化されていないことを意味します。

GitHub 設定で修正:

1. `Settings -> Pages -> Source: GitHub Actions`
2. `docs-pages` ワークフローを再実行

## FAQ

### ブラウザツールが使えないとき最初は何を実行すべきですか？

再インストール前に `scripts/doctor-browser-mcp.sh`（または PowerShell 版）を実行してください。

### `codex` を入力してもコンテキストが注入されないのはなぜですか？

通常、wrapper が読み込まれていない、`CTXDB_WRAP_MODE` が現在のワークスペースをカバーしていない、またはコマンドが透伝管理サブコマンドであるのが原因です。

## スキルが誤ったレポジトリディレクトリに保存された

canonical repo skill sources の場所は以下に変更されました：

- `<repo>/skill-sources`

生成された repo-local 検出可能な出力は以下の場所にあります：

- `<repo>/.codex/skills`
- `<repo>/.claude/skills`

並行ディレクトリ（例：`.baoyu-skills/`）に `SKILL.md` を保存すると、Codex / Claude はそれを repo-local スキルとして検出できません。

- `.baoyu-skills/` は `EXTEND.md` のような拡張設定のみに使用
- 本来のスキルソースファイルは `skill-sources/<name>/SKILL.md` に移動
- `node scripts/sync-skills.mjs` で生成されたクライアントルートを再構築
- `scripts/doctor-contextdb-skills.sh --client all` で未対応の repo skill roots を検出
