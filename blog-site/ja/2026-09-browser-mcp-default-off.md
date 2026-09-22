---
title: "v6.1.0: Browser MCP がデフォルトでオフ — インストール時の3つのchoice、いつでも切替"
description: "v6.1.0 は、すべてのマシンに Browser MCP を自動で入れません。インストール時に none / playwright / bsk のうち一つを選ぶと、AIOS は選んだエンジンだけを各 client へ materialize します。デフォルトは最も重い方、つまりオフです。"
date: 2026-09-23
tags: ["AIOS", "browser-mcp", "memory", "default-off", "release", "v6.1.0"]
---

# v6.1.0: Browser MCP がデフォルトでオフ — インストール時の3つのchoice、いつでも切替

> **Quick Answer:** かつて browser automation はデフォルトでオンでした。それぞれのマシンに full の Browser MCP が materialize されました。各 client の Browser MCP は Chrome を起動しますが、framework はそれを完全に解放できませんでした。v6.1.0 はデフォルトを「オフ」にします。インストール時に **`none`** / **`playwright`** / **`bsk`** のうち一つを選び、AIOS は選んだ engine を使います。この choice は settings に残り、1つの command でいつでも変えられます。各 client の後ろにある writer はすべて end-to-end でこれを尊重します。重い方がデフォルトになったので、入れただけでデフォルトが軽く静かになります。

## The problem: 一度起動すると止まらない自動化

workflow は browser を動かすことが出来ました。欠けていたのは能力ではなく、**コスト**、そしてそのコストを誰が払うかということでした。

1. **browser を使わないマシンも browser のコストを払っていた。** Browser MCP は `.mcp.json` を materialize する時点でデフォルトオンでした。なので、AIOS を入れた瞬間、使う使わないにかかわらず、設定に browser の runtime が置かれます。
2. **memory のコストは実際にあり、複利で増える。** 最近の査で、主な重さは ~75 の process ではなく、**7 の `browser-mcp` がそれぞれ自前の Chrome を起動している**ことが分かりました。数百MB ずつです。実際に page を見ない session もそのコストを増やします。
3. **死んだ client は自分自身を解放できなかった。**インタラクティブな `ctx-agent` は `spawnSync` の shell であり、それが起きたあと始末をしません。なので、browser が一度起動すると、framework にはこれを解放する仕組みが無く、アイドルの時に解放する機制も無かったのです。
4. **出口がなかった。** 「browser automation」を使いたい人は、生成された設定を手で削除しなければならず、実際の人たちはそんなことをあまりしません。

今回の修正が目指したのは、browser を「choice 制」にすること、時には各 agent が完全に分離して動くこと、そして user に 1つの switch を用意することです。

## v6.1.0 で変わったこと

### 1. デフォルトで Browser MCP を入れない

Browser MCP はインストール時に自動で有効化されなくなり、デフォルトは **`none`** です。operator が口を出すまで、browser に関係する行は 1つも設定に書きません。最も重い方をデフォルトに選ぶのは故意です。browser を利用したい時だけ入れ、要らなければ 1つもコストを払いません。

これは「browser automation が optional」ではなく、「browser automation が**明示的**」です。要る時には完全に揃います。要らなければ、framework は静かに自分から開きません。

### 2. インストール時の3つのchoice、3つの mode は互斥

インストール時（あるいはいつでも）は、1つだけ選べます：

| mode | 提供するもの | いつ選ぶか |
| --- | --- | --- |
| **`none`**（デフォルト） | Browser MCP を完全に入れない。Chrome も browser の別名もゼロ。 | ほとんどの user。browser は「使う時に取る」tool で、常時 ON ではない。 |
| **`playwright`** | リポジトリ内 Node/Playwright の runtime（各 agent が独立して起動）+ launch snippet。 | プログラム的な browser 制御と、Playwright が出す分離が要る時。 |
| **`bsk`** | 真人 session 式自動化：ログインした Chrome を拡張 + local daemon で使う。 | 真人 session が要り、人が真人として request に応えながら drive する時。 |

3つは構造により互斥です。選んだ engine だけが client へ materialize され、変えると古い別名を落とし、古い方も削除します。

### 3. mode の接缝：writer が end-to-end で尊重

全体が、すべての writer が共有する接缝 `mcp-mode.mjs` に乗っています：

- `browserManagedServer` は `none` と `bsk` に対して `null` を返します。各 client の設定から **browser の別名が drop** され、**古い方が削除** されます——Cod TOML、OpenCode、Hermes YAML、ZCode、Gemini、そして共有の migration path です。
- **Playwright だけの runtime check** は gate で止まります。`none`/`bsk` を選ぶと、リポジトリ内 Node/Playwright の installer をそのまま skip します。
- 各 writer は設定から mode を `resolveBrowserMode` で読み、それに従って materialize します。なので、この choice は全 client で一貫します。

### 4. 1つの command でいつでも変えられる

mode は settings の中の 1つの data なので、lock されません：

```bash
aios internal browser switch playwright   // または：bsk | none
```

この 1つの command は **全 client** へ再 materialize します。同じ `mcp-migrate` の path を使い、現在の client も 1歩で新しい engine に替えます。`bsk` に変えると、AIOS は 3step の guide（CLI → 拡張を入れて Connect → run）と `browser_*` → `bsk` の tool map を出します。`playwright` に戻すと guide は消えます。

### 5. BSK: 告警のみ、硬くは壊れない connectivity baseline

BSK は真人 session 式 browser automation です——拡張と local daemon でログインした Chrome を使い、Playwright とは互斥です。CLI・daemon・拡張の 3つが同一 version で揃う必要があるため、v6.1.0 は「connectivity あり」とせず、connectivity baseline を見る `bsk-doctor` を用意しました：

```bash
aios internal browser bsk-doctor
```

- `bsk status --json` を読み、`version_skew:false` を健全な baseline とします（CLI/daemon/拡張がすべて同一 version）。
- `bsk` CLI が無ければ、**告警のみ**（owner action：`install.ps1 --browser bsk` を run）して次へ進みます。session を硬く壊しません。
- daemon がまだ connectivity していなければ、「Connect」を押すよう促して、そのまま続けます。

これは故意です。硬くする doctor は「まだ connectivity しない」を「硬い blocker」に変えます。browser doctor は、促すべきで、止めるべきではありません。

## なぜこれが Traditional な agent より一歩先なのか

Traditional な coding agent は、install した瞬間にすべての力を入れ、入れたまま止まらず——Chrome は常時、別名は設定に眠り、きれいに止める方法が無いのです。AIOS はすでに flow を走らせ、contract を守ってきた——**しかし「デフォルトで何を入れるか」は常に owner の decision ではなかった**——ただデフォルトで ON でした。

v6.1.0 はこの穴を埋めます：**install 自体が decision になる**のです。browser の engine を選び、framework は要る分だけ materialize し、要らない分は一律に書きません。writer は全 client で一貫し、変えたくなったら 1つの command で終わりです。これが「すべてを開く agent」と「求めたものだけを開く agent」の違いです。

## Reference materials

- install 時の question、`switch` command、BSK guide は `scripts/lib/components/browser/`（`mcp-mode.mjs`、`switch.mjs`、`prompt.mjs`、`bsk-writer.mjs`）にあります。
- `bsk-doctor` connectivity baseline と全 test は `scripts/tests/bsk-writer.test.mjs`（14 cases）+ browser/mcp writer の test にあります。
- 完全な release plan、scope、そして 6.1.0 の version decision（minor → `6.1.0`）は `docs/plans/release-6-1-0-browser-default-off-and-lighter-sessions.md` にあります。
- Verification: 57 case の target test が通過しています（wiring guard W1–W6 は、追加の各 CLI command が実際に reach できることを保証します）。実際の command `aios internal browser switch bsk` は全9つの client を materialize し、end-to-end で guide を出します。

> **Note:** この日本語版は AI が作成した草案です。公開前に日本語話者による確認をおすすめします。
