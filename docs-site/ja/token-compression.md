---
title: Token Intelligence と圧縮の境界
description: RTK、Caveman、Headroom MCP、ContextDB、Ponytail に着想を得た判断ゲートを正しく使います。
---

# Token Intelligence と圧縮

## まず答え

context efficiency は一つの compression switch ではなく workflow です。Harness CLI は smallest-correct-change gate、RTK の shell output filter、Caveman の response style、明示的な Headroom MCP tool、pull-based ContextDB recall を分離します。どの層も test、privacy check、final verification の代わりにはなりません。

## 今すぐ実行

~~~bash
node scripts/aios.mjs init --all --dry-run
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
aios doctor --native --verbose
~~~

Headroom には Python 3.10 以降と uv または pipx が必要です。AIOS は隔離された tool environment に headroom-ai[all]>=0.31.0,<0.32.0 を install します。

## 5 つの層

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Ponytail-inspired gate | まず explanation、configuration、small edit を検討 | install される Ponytail plugin ではない |
| RTK | Agent が読む前の local shell / tool output noise を filter | scoped command や raw log の全行の代わりではない |
| Caveman | technical fact を残して response style を短くする | file や tool 自体は圧縮しない |
| Headroom MCP | 後続 step で必要な材料を明示的に compress / retrieve | current model request を transparent interception しない |
| ContextDB | 全 history を inject せず project context を必要時に recall | runtime history を全 prompt に自動表示しない |

planning、review、privacy、test、verification は別の quality gate です。

## RTK と Caveman

RTK は local command-output layer です。path と failure を残すため、範囲を限定した command を使います。

~~~bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
~~~

Caveman は concise status と checkpoint のための local prompt skill です。command、path、error、date、decision、risk、missing verification を落とさないでください。

## Headroom MCP は明示的

Headroom upstream には一部 client 向け official wrap target があります。AIOS v3.6.0 は aios init がすべての client launch を自動 wrap するとは主張しません。install と MCP registration は別です。

| Client | Route | Condition |
| --- | --- | --- |
| Gemini CLI | user-scope official MCP registration | separate MCP consent |
| Grok Build | user-scope official MCP registration | separate MCP consent |
| Hermes Agent | user-scope official MCP registration | real TTY、なければ pending-interactive |

server は headroom_compress、headroom_retrieve、headroom_stats を公開し、model が明示的に呼び出します。model が original を先に見ている場合、現在の turn では節約されず tool call が増えることもあります。主な利点は後続 step で compact result を保持し、必要時に reference から original を retrieve できることです。

AIOS は所有する registration を ~/.aios/integrations/headroom-mcp.json に記録し、external / conflict entry を上書きしません。

## ContextDB context pack

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

balanced は最近の作業と failure signal を保ち、aggressive は detail budget を小さくし、legacy は compatibility のため history tail を使います。[ContextDB](contextdb.md) も参照してください。

## 判断順序

code、dependency、file、広い context を追加する前に：

1. explanation または configuration change で解決できるか。
2. 既存の function、document、tool を使えるか。
3. focused query で repository、page、log 全体の read を避けられるか。
4. それでも足りなければ最小の tested implementation を追加する。

browser では semantic_snapshot または targeted extract_text から始めます。

## これは約束しない

- local measurement のない universal token saving percentage。
- すべての model request の transparent interception。
- provider traffic が消えること。
- すべての client launch の自動 wrap。
- error、path、decision、verification evidence の破棄。
- ContextDB search、test、privacy review、final verification の代替。

## FAQ

### すべての layer を install すべきですか？

いいえ。まず aios init --all --dry-run で予定状態を確認し、必要な package と integration だけを選びます。

### Headroom は RTK と同じですか？

いいえ。RTK は local command output を filter し、Headroom は明示的な MCP tool path、Caveman は response style だけを扱います。

### 実際の効果をどう測りますか？

headroom_stats で compression event と正の saved-token total の両方を確認します。upstream benchmark は local AIOS evidence ではありません。

### ContextDB は単独で使えますか？

はい。memory、memo、search、checkpoint は RTK、Caveman、Headroom とは別です。

## 次に読む

- [クイックスタート](getting-started.md)
- [ContextDB](contextdb.md)
- [Workflow Policy](workflow-policy.md)
- [Headroom + Ponytail workflow 記事](https://cli.rexai.top/blog/ja/2026-07-headroom-token-intelligence/)
