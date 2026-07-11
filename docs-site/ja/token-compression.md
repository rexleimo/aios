---
title: Token インテリジェンスと圧縮
description: RTK、Caveman、Headroom MCP、ContextDB、Ponytail に着想を得た判断ゲートで、有用なコンテキストを小さく保ちます。
---

# Token インテリジェンスと圧縮

token を節約しても、Agent が正しい判断を下すための証拠を失っては意味がありません。AIOS v3.6.0 は、まず不要な作業を避け、次に各段階で持ち運ぶテキストを減らす層状の workflow を使います。

## 5 つの層

| 層 | 役割 | 約束しないこと |
| --- | --- | --- |
| Ponytail に着想を得たゲート | 実装前に最小で正しい変更を選ぶ。 | インストールされる Ponytail plugin ではありません。 |
| RTK | Agent に届く前の shell / tool 出力のノイズを減らす。 | 範囲を絞った command を不要にしたり、生 log の全行を残したりはしません。 |
| Headroom MCP | 後続 step でも必要な材料を、対応 MCP client が明示的に圧縮できるようにする。 | 現在の model request を透過的に interception しません。 |
| Caveman | 技術的事実を落とさず、response style を簡潔にする。 | tool や file 自体を圧縮しません。 |
| ContextDB | 全 history を inject せず、必要な時に project context を recall する。 | runtime history をすべての prompt に自動表示しません。 |

planning、test、code-review の証跡、privacy check、verification は別の品質ゲートとして引き続き必要です。

## インストールと確認

インストールの境界として `aios init` を使います。

```bash
# 確認のみ。package と client configuration は変更しません。
node scripts/aios.mjs init --all --dry-run

# 対話式: 検出された RTK、Caveman、対応する Headroom を install します。
node scripts/aios.mjs init --all

# CI などの無人インストール。
node scripts/aios.mjs init --all --yes-compression-tools

# Gemini と Grok 向けの user-scope Headroom MCP registration も許可します。
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

Headroom には Python 3.10 以降と `uv` または `pipx` が必要です。AIOS はテスト済みの `headroom-ai[all]>=0.31.0,<0.32.0` を隔離された tool environment に install し、system Python environment を無言で変更しません。

`--yes-compression-tools` は package installation を許可します。`--yes-headroom-mcp` は client user configuration の変更を許可するため、意図的に分けています。dry run は package の download や configuration の書き込みをせず、予定状態を報告します。

## RTK と Caveman

RTK はローカルの command-output layer です。初期化後、対応 command の出力を Agent が読む前に filter できます。重要な error と path を見失わないよう、範囲を絞った command を使い続けてください。

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

Caveman は Agent の表現を短くするローカル prompt skill です。command、path、error、date、decision、risk、未実施の verification を保持する必要があります。status update や checkpoint に便利ですが、詳しい説明の方が役立つ時は通常の style に戻してください。

## Headroom: MCP は明示的、wrapper 対応は別

Headroom の upstream CLI には一部 client 向けの公式 `wrap` target があります。wrapped client は Headroom 自身の proxy と lifecycle を使えます。**AIOS v3.6.0 は `aios init` がすべての client launch を自動 wrap するとは主張しません。** Headroom の install と MCP server の registration は別の操作です。

この integration で upstream wrap target がない client では、AIOS は client 自身の MCP command を用いて公式 `headroom mcp serve` process を登録します。

| Client | v3.6.0 の経路 | 重要な条件 |
| --- | --- | --- |
| Gemini CLI | user-scope の公式 MCP registration | 別途 MCP consent が必要です。 |
| Grok Build | user-scope の公式 MCP registration | 別途 MCP consent が必要です。 |
| Hermes Agent | user-scope の公式 MCP registration | 実際の TTY で完了する必要があります。そうでなければ `pending-interactive` です。 |

MCP server は `headroom_compress`、`headroom_retrieve`、`headroom_stats` を公開します。model が明示的に呼び出します。通常、圧縮を要求する前に元の材料を既に読んでいるため、現在の turn では token が節約されず、tool call が 1 回増える場合もあります。利点は後続 step にあり、compact result を保持し、必要な時だけ original を reference で retrieve できます。

AIOS は所有する registration を `~/.aios/integrations/headroom-mcp.json` に記録します。既存の `headroom` entry が external だったり期待する fingerprint と異なったりする場合、installer は `external` または `conflict` を報告し、上書きしません。

### ContextDB Packet

session history の圧縮には次を使います。

```bash
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

| Strategy | 使う場面 | 動作 |
| --- | --- | --- |
| `balanced` | Default | 低シグナル text を圧縮し、error と最近の作業を保持します。 |
| `aggressive` | 非常に小さい budget | 最大限に圧縮し、detail は最小限にします。 |
| `legacy` | 旧来の挙動 | history の末尾だけを保持します。 |

**保持されるもの**（削除しないもの）:

- Error message と failure signal
- File path と command output
- 最近の state と decision

## 実践的な判断順序

code、dependency、file、広い context を追加する前に、[Ponytail](https://github.com/DietrichGebert/ponytail) に着想を得た順序を使います。

1. 説明、configuration change、またはより小さな edit で解決できるか。
2. 既存の function、document、tool が既に対応していないか。
3. repository、page、log 全体を読む代わりに、focused query を使えないか。
4. その後で初めて、要件を満たす最小の tested implementation を追加する。

browser 作業では、semantic snapshot、targeted text、full text、full HTML、必要な時だけ screenshot の順で compact evidence を読みます。

## Privacy と測定

- RTK と Caveman はローカルで動作します。Headroom の install は package repository や任意の model resource にアクセスする場合があります。
- Headroom wrapper または通常の client は、user が設定した model provider へ引き続き model request を送ります。ローカル圧縮は provider traffic がなくなる保証ではありません。
- upstream saving percentage は upstream benchmark であり、ローカル AIOS の証拠ではありません。`headroom_stats` が compression と正の saved-token total の両方を示した時だけ、測定済み MCP savings を主張してください。

## さらに読む

- [v3.6.0 リリースノート](changelog.md)
- [Headroom + Ponytail workflow の記事](https://cli.rexai.top/blog/ja/2026-07-headroom-token-intelligence/)
- [ContextDB](contextdb.md)
- [Ponytail upstream project](https://github.com/DietrichGebert/ponytail)
