---
title: "v3.6.0: Headroom と Ponytail でより安全な Token インテリジェンス workflow を作る"
description: "Harness CLI は RTK、Caveman、Headroom MCP、ContextDB、Ponytail に着想を得た判断ゲートを組み合わせ、client configuration の所有権を明示的に保ちます。"
date: 2026-07-10
tags: ["AIOS", "Headroom", "Ponytail", "RTK", "Caveman", "MCP", "token compression"]
---

# v3.6.0: Headroom と Ponytail でより安全な Token インテリジェンス workflow を作る

token を節約することは、Agent が適切な engineering decision を下すための証拠を削除することではありません。v3.6.0 は、不要な作業を避け、ノイズの多い input を圧縮し、step をまたぐ大きな材料を効率よく保持し、簡潔に書き、必要な時だけ history を recall する 5 層の token インテリジェンス workflow の installation と compatibility control plane を追加します。

## 5 つの層には異なる仕事があります

| 層 | 仕事 |
| --- | --- |
| Ponytail に着想を得たゲート | code、dependency、file、広い context を追加する前に、最小で正しい変更を選ぶ。 |
| RTK | shell と tool output のノイズをローカルで減らす。 |
| Headroom | 後続 MCP step で必要になる材料の compact representation を保存し、retrieve する。 |
| Caveman | 技術的事実を削除せず、Agent response を簡潔に保つ。 |
| ContextDB | 全 history を inject せず、過去の project context を pull-based にする。 |

この gate は [Ponytail](https://github.com/DietrichGebert/ponytail) に着想を得たもので、source と license を尊重しています。AIOS は upstream plugin を install または emulate すると主張しません。planning、test、code review、privacy check、verification は別の品質ゲートです。

## なぜ Headroom をすべての shell に強制しないのか

Headroom の upstream CLI は一部 client 向けに公式 `wrap` target を提供します。wrapper は自身の proxy、provider configuration、cleanup lifecycle を担います。すべての client が wrapped であるかのように shell level で injection すれば壊れやすく、他の client configuration と競合する可能性があります。

そのため v3.6.0 integration の境界は、より狭く検証可能です。

- `aios init` はテスト済み Headroom range を検出し、隔離された tool environment に install します。
- Gemini CLI、Grok Build、Hermes Agent は各自の公式 MCP command を使い、公式 `headroom mcp serve` process を登録します。
- AIOS は絶対 path の Headroom executable を使い、結果の entry を読み直し、AIOS 所有 registration だけを `~/.aios/integrations/headroom-mcp.json` に記録します。
- 既存の external entry や一致しない entry は `external` または `conflict` と報告され、決して上書きされません。

Hermes では host CLI の tool-enable interaction のために実際の TTY が必要です。非対話 init は成功を主張せず `pending-interactive` を報告します。

## MCP は明示的な圧縮であり、透過的 interception ではありません

`headroom_compress`、`headroom_retrieve`、`headroom_stats` は model が明示的に呼び出す MCP tool です。model は圧縮を要求する前に原文を読むことが多いため、現在の turn で token が節約されない場合も、tool call が 1 回増える場合もあります。

利点は後続 step にあります。compact result を保持し、必要な時だけ original を retrieve し、statistics で実際の作業を測定できます。MCP saving を計測済みと説明するのは、stats が成功した compression と正の saved-token total の両方を示す時だけです。upstream benchmark percentage はローカル AIOS の証拠ではありません。

## 1 つの installation flow、独立した 2 つの permission

```bash
node scripts/aios.mjs init --all --dry-run
node scripts/aios.mjs init --all
node scripts/aios.mjs init --all --yes-compression-tools
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

2 番目の無人 flag は意図的に分けています。local package installation の許可は user の MCP configuration を変更する許可を意味しません。Headroom には Python 3.10 以降と `uv` または `pipx` が必要です。AIOS はテスト済みの `headroom-ai[all]>=0.31.0,<0.32.0` range を使い、system Python environment に無言で install しません。

## 実用的な判断順序

repository、web page、log 全体を読む前、または新しい implementation を追加する前に確認します。

1. より小さな edit、configuration change、または説明で解決できるか。
2. 再利用できる既存 implementation または document があるか。
3. 必要な証拠を focused query で取得できるか。
4. その後で初めて、最小の tested change を作る。

この順序は formatting pass よりも大きく節約できます。低価値な context や implementation がそもそも存在しないようにするためです。

## Privacy の境界

RTK と Caveman はローカルで動作します。Headroom の install は package repository と任意の model resource に接続する場合があります。Headroom wrapper または通常の client は user が選んだ provider へ引き続き model request を送ります。ローカル圧縮は provider traffic をなくしません。

操作の詳細は [Token インテリジェンスと圧縮ガイド](https://cli.rexai.top/ja/token-compression/) を、release record は [v3.6.0 変更履歴](https://cli.rexai.top/ja/changelog/) を参照してください。
