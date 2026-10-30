---
title: "v6.16.0：まともな「fresh context」——AIOS が計測し、宣言し、注入し、fork を無害化する"
description: "v6.16.0 は「fresh context, not a fork」を『プロセス起動の偶然に成立していた』状態から、計測され、宣言され、注入され、テストで固定された契約に変える。AIOS が起動する worker は構造的に fresh だった（一回きりの prompt、RESERVED_FLAGS が --resume をブロック）。宿主自身の Task/Agent ツールには制約もローカル証拠もゼロだった。だからまず計測した：nonce プローブ（aios agents probe --client <id>）が親会話に AIOS-NONCE-<16 hex> を埋め込み、子に复述を求める——codex は直接証拠つきで fork、pi は subagent ツール面を持たないので not-applicable、unknown は理由付きで正当な結論。config/host-capabilities.json には subagents のサイドカー・ブロックを追記（評価軸ではない。軸を増やすと合計点が動き、レポートの同時書き直しを強いられる）。エージェントカードの指示を単一の owner に集約し、生成カード 38/38 枚が Output Contract をちょうど 1 部だけ持つ。そして毎回のディスパッチに自己完結した ## Dispatch Brief を注入する——これが fork を『禁止』ではなく『無害』にする一手だ：worker は事実に欠けがあれば親の継承コンテキストに頼まず blocked を返す。fs.readFileSync に計測器を仕掛けたことで、自分たちのドキュメント前提も否定された：10 個の shared native partial のうち loader が実際に読むのは 1 個（core/core-instructions.md）だけ。そこで partial ごとに composed / documentation-only の明示的な処置を必須にし、両方向の挙動で証明するゲートを入れた。途中で stripManagedTables も修正した：TOML のテーブル名を『表記』で比較していたため同じパスの [projects.*] を重複させ、codex の全コマンドを exit 1 にしていた。しかも単一のスキップフラグが MANAGED_END まで人間が書いた設定を飲み込む、潜在的なデータ損失経路でもあった。"
date: 2026-10-30
tags: ["AIOS", "v6.16.0", "サブエージェント", "fresh context", "Dispatch Brief", "能力宣言", "テスト", "release"]
---

# v6.16.0：まともな「fresh context」——AIOS が計測し、宣言し、注入し、fork を無害化する

> **要約：** 会話を継承した subagent は、あなたの**誤った前提**も継承する。きれいな dispatch 面が 1 つ、
> 完全に無制約の dispatch 面が 1 つあった。そして現場でいちばん loud な主張（「Codex は既定で fork する」）は、
> 他人の断言であってローカル証拠はゼロだった。本リリースはそれを計測し、宣言し、**自分たちが生成する成果物**に制約を書き込み、
> そして気にする理由そのものを消した：自己完結した brief。`unknown` は引き続き正当な答えだ。どのゲートも既定で赤にはしない。

## 私たちが写すことを拒否した前提

Matt Pocock の skills 線は「fresh context」に具体的な工学的理由を与えている：親の transcript を継承した実装者は、
親の**誤った前提**も一緒に継承し、自分が本当に見るべきコンテキスト handoff を得られない。いい話だ。しかし
「Codex は既定で fork する」は外部の主張として我々の会話に入ってきた。このリポジトリの規則は
**計測していないものは計測していないと記録する**。だから指示文を書く前に、プローブを作った。

```
親会話   →  AIOS-NONCE-A8AF556CF1934014 を埋め込み、子に复述を求める
子の回答 →  复述できた        → fork
           复述できなかった    → fresh
           それ以外すべて      → unknown + reason
```

実際の headless codex での `aios agents probe --client codex --json` の戻り値：

```
verdict=fork  reason=child-reported-parent-nonce  confidence=indirect
```

……保存された回答の banner には session `01a18ae5-a4a8-7882-988d-60e1e98bdb53` がそのまま残っており、
誰でも検証できる。pi は違う答えを返した：そもそも subagent ツールを持たないので
`surface: none` / `contextMode: not-applicable`、confidence は `direct`。8 クライアントはいまだに `unknown`——
これは**意図的**だ。

## 2 つの dispatch 面、扱いを分ける

| dispatch 面 | v6.16.0 以前 | 現在、誰が owner か |
|---|---|---|
| AIOS が起動する worker | 構造的に fresh——ただし実装の副産物にすぎなかった | `one-shot.mjs` は一回きりの prompt を渡すだけ。`RESERVED_FLAGS` が `--resume` / `--continue` を拒否 |
| 宿主自身の Task/Agent ツール | **制約ゼロ**：宣言なし、計測なし、カードに一言もない | プローブ → 宣言 → カード条項 → Dispatch Brief |

実装中に誠実さを保つために効いた 3 つの規則：

- **`unknown` は正当な結論。** `fresh` を既定にすることも、blocker にすることも絶対にしない。
- **サイドカーであって評価軸ではない。** `CAPABILITY_AXES` は固定 token 集。軸を 1 本増やせば scorecard の合計点が動き、
  レポートの同時書き直しが必須になる。`subagents` は横にぶら下げたので、`client-capability-scorecard.mjs --check` のドリフトはゼロのまま。
- **モデルの自己申告は裏付けにはなっても、創出にはならない。** pi が「subagent ツールはない」と言ったのが
  `direct` 証拠になるのは、**設定がすでに `surface: none` を宣言していたから**だ。未宣言のクライアントが同じことを言っても
  `unknown / no-subagent-spawned` のまま。散文は能力の事実を作れない。

## 私たちが信じていた到達面——そしてそれは誤りだった

計画にはこうあった：共有 native partial に規律を書けば、全クライアントに届く。私たちはディレクトリ構造を信じず、
`fs.readFileSync` に計測器を仕込んで 10 クライアント分の投影を実際に走らせ、**到達**を測った：

```
core/core-instructions.md   →  composeNativeMarkdown() が読む、10/10 クライアント
残り 9 個の partial            →  何も読んでいない。caller ゼロ
```

`readSharedMarkdownParts`——それらを引き込む唯一の関数——にはリポジトリにもインストール済みランタイムにも
呼び出し箇所が**存在しない**。しかも私の最初のカウントは 2 段階で誤っていた：basename を grep して
「7 個の孤児」と報告したが、それは docs や blog の**言及**を参照として数えていたためだ。真数は 9。
**「ファイルが書かれた」と「モデルが読んだ」は別の事実だ。**

したがって到達面はちょうど 2 か所、どちらも私たちの側にある：

- **worker 側** —— 3 つの固定条項、単一 owner（`emitters/shared.mjs`）：親会話の継承なし、brief とそれが指す ref だけで働く、
  事実に欠けがあれば `blocked`、親に transcript を貼らせることはしない。生成カードは実測で
  **38/38 枚**が 3 条項すべてを命中させ、Output Contract は**ちょうど 1 部**。19 個の role source に手書きコピーされた
  陳腐化したフィールド表（`agentId/blockers/evidenceRefs`）は強制 schema と矛盾していたため、schema への 1 行のポインターに置き換えた。
  古い表は**ソースで削除せずレンダリング時に除去**する——`REQUIRED_PROMPT_MARKERS` が `## Output contract` 見出しの存在を
  要求しつづけているからだ。
- **ディスパッチ側** —— `## Dispatch Brief`：純関数 1 つで構築し、レンダラー 1 つで描画し、**既存の** prompt 組立器に注入する。
  2 番目の組立器は作らなかった。

fork はここで正確性の問題ではなくなる：必要な事実がすべて brief にあるなら、親のコンテキストを継承しても
worker が得るものはなく、token を浪費するだけだ。

## 報告するゲートと、赤くなるゲート

`aios status` はもはや曖昧な 1 語ではなく、分解された事実を出す：

```
subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
```

`fork` は「計測済み」という中立的なカウントに吸収されず、リスク事例として単独表示され、
全体は `blockers` の外に置かれる——このリポジトリは `duplicateLines` から
**処置計画のない既定赤のゲートは、直されるのではなく黙殺される**ことを学んだからだ。
赤くなるのは**到達の主張**の側：`native-partial-delivery.test.mjs` は partial ごとに
`composed` または `documentation-only` ＋理由の明示を要求し、`composed` は挙動で証明する
（loader に読まれ**かつ**最終成果物に視認できること）、`documentation-only` は読まれないことを証明する。
両方向とも、ゲートに嘘をついて実測済み：composed と嘘をつけば赤、黙って到達して宣言を変えなければ赤。

## プローブが途中で転けたもの

- **`stripManagedTables` は TOML テーブル名を『表記』で比較していた。** 同じパスが `"C:\\Users\\..."` と
  `'C:\Users\...'` の 2 通りで書かれると、デコード後のキー 1 つに対して `[projects.*]` が 2 つになり、
  codex は完全に起動しなくなった：`duplicate key`、exit 1、全コマンドが。同じ関数にもっと悪い欠陥が隠れていた——
  「管理ブロック内」を表すフラグが 1 つだけだったため、マークのない旧式 AIOS テーブルで `MANAGED_END` まで
  **人間が書いた後続設定を飲み込んで削除**する。今はテーブルの同一性＝**デコード後のキー**を `path.resolve()` で比べ、
  状態フラグも 2 つに分離した。
- **宿主の banner が分類器を騙した。** 実際の codex 回答が `answer-not-json` と記録された——
 パーサが最初の `{` から最後の `}` まで切り出したところ、banner が echoedした prompt がそれを壊していた。
  現在はbalance の取れた JSON オブジェクトだけを走査し、`subagentSpawned` を持つ 1 つのみを受け入れる。
  さらに明示：**echoed された nonce は fork の証拠ではない**。
- **pi の JSON イベントストリームは prompt を echoed する**（nonce も含まれる）。生の stdout を判定すると
  永久に偽の `fork` になるため、判定は解析後の `assistantText` だけを読む。
- **証拠ファイルにサイズ上限を設けた。** ある宿主ストリームは実測 208,782 文字。回答は打ち切って保存し、
  `answerLength` / `answerTruncated` を添える。
- **Windows の shim はバージョンを返さなかった。** `spawnSync('pi', …)` は npm shim を抜けてバージョンを読めない。
  これは版ドリフト検出を**永久に静かに無効化**していた。現在は版取得も platform spawn spec 経由——
  ここにある他のすべてと同じく、単一 owner だ。

## 本リリースが正直に認める空白

- 完成定義の **D3 は未達成**：hermetic な空セッションに brief **だけ**を渡して schema 準拠の handoff を出させる実行は、
  **一度も走らせていない**。既存テストが証するのは構造的な可用性であり、静的アサーションをモデル実行の代わりにはしない。
- 10 クライアント中 8 が未計測。それぞれ 1 回の実宿主呼び出しが必要。
- 9 個の partial には規律の文があるのに到達面がない。共有 `AGENTS.md` に書くと、subagent ツールを持たない
  クライアントへ指令が漏れる。だからそれは独立した設計判断——本リリースが固定するのは
  **「ファイルを書くことは到達ではない」**の一点だけ。
- インストール済みランタイムの `stripManagedTables` はまだ修正前。そこから native install を実行すると
  duplicate key を再造りしうる（更新するまで）。

## 試してみる

```bash
aios agents probe --client <id> --json      # ある宿主のコンテキスト継承を計測
aios agents probe --client <id> --dry-run   # 何を実行するかだけ出力。モデル呼び出しを消費しない
aios status                                 # subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
node scripts/aios.mjs standards --root . --rule directoryEntries
```

本リリースの担保証拠：全文レグレッション 2484 tests / 2475 pass / 0 fail / 9 skipped；
probe + declaration + runner の 3 スイート 28/28；生成カード 38/38 がちょうど 1 部の契約；`check-syntax` 1296 ファイル / 0 失敗；
`scorecard --check` は 13 クライアントで ok・ドリフトなし；`check-doc-citations` の invalid は 335 → 335 のまま、refs は 542 → 563。
