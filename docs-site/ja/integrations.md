---
title: サードパーティ統合（TypeSafe / Jev）
description: "コミットを固定し、ハッシュを検証し、ドライランできる 1 つのコマンドでサードパーティ製エージェントスキルと MCP サーバーを導入します。最初の対応ベンダーは TypeSafe（System One / Jev）で、AIOS の 9 クライアントすべてを対象にします。"
---

# サードパーティ統合（TypeSafe / Jev）

> **要点：** `aios integration add <ベンダー>` は、固定したコミット、検証済み sha256、クライアント別の登録プラン、そして実際のハンドシェイク確認によって、サードパーティ製スキルとその MCP サーバーを導入します。最初に対応したベンダーは **TypeSafe（System One / Jev）** です。まず `aios integration add typesafe --dry-run` を実行し、ディスクに変更が入る前にクライアントごとの計画を確認してください。

## 統合コマンドが必要な理由

多くのベンダーは導入方法を文章で示します —「このプロンプトをコピー」「この設定をエージェントに貼り付け」。これはサプライチェーンのリスクです。そのテキストにはバージョンもハッシュもなく、あなたの実際のクライアント構成で検証もされていません。

`aios integration` はその文章を、4 つのハードゲートを備えた運用コマンドに変えます。

| ゲート | 何を証明するか |
| --- | --- |
| コミットの固定 | スキルは移動するブランチではなく、不変のリビジョンから取得される |
| sha256 の検証 | 内容がレビュー済みの成果物と一致する。改変・古いコピーは拒否される |
| クライアント別プラン | AIOS の 9 クライアントすべてに明示的で検査可能な登録手順がある |
| 実際のハンドシェイク | ドキュメント MCP サーバーに到達でき、期待するツールを公開している |

## 対応モデル

AIOS はベンダーのモデル情報を統合契約の一部として扱うため、ルーティングやプロンプトから直接指定できます。

| ベンダー | モデル | モデル ID | 認証情報 | ドキュメント MCP |
| --- | --- | --- | --- | --- |
| TypeSafe（System One） | Jev | `jev-latest` | `TYPESAFE_API_KEY` | `https://docs.typesafe.ai/mcp` |

**TypeSafe System One** は、プログラミングのプリミティブのように使える小さな AI 知能を提供します：`Choice`、`Score`、`Noul`。**Jev** は自然言語とアプリケーション状態を、通常のコードで組み合わせられる型付きの判断と確率に変換し、「プロンプトして解析する」ステップを構造化された意思決定に変えます。

## 認証情報の設定

`TYPESAFE_API_KEY` はこのベンダーに必要な唯一の認証情報です。AIOS は**存在の有無だけ**を確認し、値を読む・表示する・保存することはありません。設定はご自身で、コーディングクライアントが実際に動作する環境に対して行ってください。

最も多い失敗原因はスコープです。ある端末で `export` した変数や、別アカウントの *User* スコープに書いた変数は、すでに起動しているクライアントからは見えません。

**Windows —— 自分のアカウントに永続化：**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<あなたのキー>', 'User')
```

**Windows —— 全アカウント（管理者端末が必要）：**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<あなたのキー>', 'Machine')
```

**macOS / Linux：**

```bash
export TYPESAFE_API_KEY="<あなたのキー>"                                # 現在のシェルのみ
echo 'export TYPESAFE_API_KEY="<あなたのキー>"' >> ~/.bashrc            # 永続化
```

その後、**コーディングクライアントを再起動してください**。環境変数はプロセス起動時に一度だけ読まれます。すでに開いているクライアントは、後から設定した値を決して見ません。

クライアントから何が見えるかを確認します。認証情報の行は `present` か `unset` を報告し、値は表示しません：

```bash
aios integration doctor typesafe
```

## TypeSafe 統合のインストール

```bash
# 1. 9 クライアントすべての変更をプレビュー — 何も書き込みません
aios integration add typesafe --dry-run

# 2. スキルをインストールし、ドキュメント MCP サーバーを登録
aios integration add typesafe

# 3. 成功メッセージではなく、実際の証拠で検証
aios integration doctor typesafe
```

ドライランはクライアントごとの登録手順を表示し、人手が必要な箇所を明示します。

```text
TypeSafe integration: TypeSafe (System One / Jev) (typesafe) [dry-run]
  skill      planned @65a39f393687 sha256=71ea90d7906c
  claude     planned
             run: claude mcp add --scope user --transport http typesafe-docs https://docs.typesafe.ai/mcp
  codex      planned
             run: codex mcp add typesafe-docs --url https://docs.typesafe.ai/mcp
  gemini     planned
             run: gemini mcp add --scope user --transport http typesafe-docs https://docs.typesafe.ai/mcp
  probe      verified 2987ms
```

## クライアント対応

AIOS の 9 クライアントすべてを対象にします。「対応」とは **すべてのクライアントに正直で実行可能な次の一手がある** という意味であり、すべてのクライアントに同一の CLI があるという主張ではありません。

| クライアント | 登録方法 | AIOS の報告 |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http` | verified |
| Codex | `codex mcp add --url` | verified |
| OpenCode | `opencode mcp add --url` | verified |
| Grok | `grok mcp add -t http` | verified |
| Pi | `~/.pi/agent/mcp.json` を書き込む | verified |
| Gemini CLI | `gemini mcp add --scope user --transport http` | verified |
| Hermes | `hermes mcp add --url` | 対話端末が必要 |
| WorkBuddy | `codebuddy mcp add --agent <名前>` | 手動手順が必要 |
| ZCode | `~/.zcode/cli/config.json`（`mcp.servers`）を書き込む | stdio は検証済み。HTTP は手動手順 |

意図的な挙動が 3 つあります。

- **Hermes** は認証方式を対話的に尋ね、非対話用のフラグがありません。AIOS は答えを推測せず、スクリプトを停止させることもなく、正確なコマンドを表示して `pending-interactive` と報告します。
- **WorkBuddy** の `mcp add` は `--agent <名前>` の値を要求しますが、その一覧はまだ非対話的に列挙できません。AIOS は agent 名を捏造せず、コマンドを表示します。
- **ZCode** は `PATH` に CLI を持たない Electron クライアントです。AIOS は stdio サーバーを `~/.zcode/cli/config.json` の `mcp.servers` に書き込み、ZCode はそこから読み取ります。HTTP エントリには AIOS がまだ書き込まない `url` フィールドが追加で必要なため、そこは手動手順のままです。

クライアントが未インストールの場合はバイナリ名とともに `client-missing` として報告され、静かに成功扱いになることはありません。

## 判断ゲート（opt-in、デフォルトはオフ）

上記の統合が導入するのは**ドキュメント** MCP サーバーです。TypeSafe のドキュメントを検索できますが、判断を生成することはできません。つまり導入しただけでは Jev は何も答えません。Jev の呼び出しは別の機能であり、あなたが有効にするまで動きません：

```bash
aios judgment status                    # あなたが意思表示するまで disabled
aios judgment enable typesafe           # ~/.aios/judgment/config.json を書き込む
aios judgment ask --state "<評価対象>" \
  --questions '{"severity":{"type":"score","instructions":"リスクはどれくらい？","criteria":["無視できる","通常","リスクあり","データ喪失"]}}' \
  --risk destructive --json
```

1 バイトでもマシンの外に出る前に、3 つの条件が同時に成立している必要があります：

| # | 条件 | デフォルト |
| --- | --- | --- |
| 1 | クライアント環境に `TYPESAFE_API_KEY` がある | 未設定 |
| 2 | `~/.aios/judgment/config.json` の `enabled: true` | `false` |
| 3 | セッションの呼び出し回数と入力長の予算が残っている | 20 回、20000 文字 |

いずれかが満たされない場合、呼び出し面は存在しません。リクエストは送られず、「答えは肯定とみなす」にフォールバックするコードパスもありません。`enable --probe` は計量対象の呼び出しを 1 回だけ送りますが、それはあなたが明示的に求めた場合だけです。

判断は**提案であり、事実ではありません**。すべての結果はモデル、`x-typesafe-request-id`、トークン使用量、信頼度を伴い、AIOS はそれを 3 つの裁定のいずれかに写像します：

| 裁定 | 条件 | 意味 |
| --- | --- | --- |
| `act` | 信頼度が `actFloor` 以上 | 確認せずに進めてよい |
| `confirm` | 2 つのしきい値の間 | まず人に確認する |
| `abort` | `confirmFloor` 未満 | 行動しない |

リスクは行動しきい値を**引き上げる**方向にしか働きません。したがって破壊的な変更は読み取り専用の操作より高い信頼度を必要とします。`Noul` は設計上信頼度を持たないため、ゲートは与えられた確率をそのまま使い、数値を捏造せずにその旨を明示します。

## コマンド

| コマンド | 用途 |
| --- | --- |
| `aios integration list` | 既知のベンダーと導入内容を一覧表示 |
| `aios integration add <ベンダー> [--dry-run] [--clients a,b] [--skip-skills] [--skip-mcp]` | スキルをインストールし MCP サーバーを登録 |
| `aios integration doctor <ベンダー> [--json]` | スキルのハッシュ、クライアント登録、認証情報の有無、ライブ MCP ハンドシェイクを検証 |
| `aios integration remove <ベンダー> [--dry-run]` | AIOS が所有するものだけを解除・削除 |
| `aios judgment status \| enable \| disable \| ask` | opt-in 判断ゲートの確認・有効化・無効化・利用 |

主なフラグ：

- `--dry-run` は計画全体を表示し、何も書き込みません。
- `--clients claude,codex` は対象を特定のクライアントに限定します。既定は 9 クライアントすべてです。
- `--skip-skills` または `--skip-mcp` は、片方のレイヤーだけが必要なときに分離して実行します。
- `doctor` の `--json` は CI 向けの機械可読な証拠を出力します。

## スキルレイヤーが導入するもの

スキルは AIOS カタログ（`skill-sources/`）に入り、既存のスキル配布機構によってすべてのクライアントへ展開されます。これは AIOS 自身のスキルと同じ経路なので、サードパーティ製と組み込みのスキルが乖離しません。

AIOS はカタログ側のコピーに内部 frontmatter キーを付与して配布先を判断し、クライアントのスキルツリーへ書き込む前にそれらを取り除きます。クライアントが見るのはベンダー自身の `name`、`description`、`license` だけです。

AIOS が所有していない同名カタログディレクトリは上書きしません。`skill-sources/typesafe-ai` にあなたの編集がある場合、インストールは `unmanaged-existing-catalog-directory` で拒否し、確認すべき場所を伝えます。

## 安全性

- **認証情報は存在確認のみ。** doctor は `TYPESAFE_API_KEY` が設定されているかだけを報告し、値を読んだり表示したり保存したりしません。
- **所有権を記録。** `~/.aios/integrations/<ベンダー>.json` が AIOS の書き込んだ各エントリの指紋を保持するため、後の実行で `owned` / `external` / `conflict` を区別し、あなたが追加したエントリを上書きしません。
- **削除は範囲限定。** `aios integration remove` は AIOS が登録したエントリのみを解除し、同じファイル内の他の MCP サーバーは保持します。
- **編集前にバックアップ。** 設定ファイルは書き換え前に `.bak-<タイムスタンプ>` としてバックアップされます。

## トラブルシューティング

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `manual step required` | そのクライアントの HTTP 設定形状が未検証 | 表示されたファイルを開き、クライアントのドキュメントで transport キー名を確認 |
| `needs a terminal` | クライアントの `mcp add` が対話的に質問する | 表示されたコマンドを実際の端末で自分で実行 |
| `client not installed` | クライアントのバイナリが `PATH` にない | クライアントをインストールして再実行 |
| `probe unreachable` | ドキュメント MCP エンドポイントがハンドシェイクを完了しなかった | ネットワークまたはプロキシ設定を確認して `doctor` を再実行 |
| `unmanaged-existing-catalog-directory` | `skill-sources/<名前>` が AIOS の所有ではない | 編集を退避してからインストールを再実行 |

## 次のステップ

- [モデルルーター](model-router.md) — `task-type` を宣言し、特定のモデル面へルーティングします。
- [ContextDB](contextdb.md) — 統合スキルが参照するプロジェクトメモリ。
- [ワークフローポリシー](workflow-policy.md) — direct / guarded / planned の判断方法。
