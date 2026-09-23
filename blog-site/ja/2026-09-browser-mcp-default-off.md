---
title: "v6.1.0: Browser MCP Off by Default — Install時に1つ選択、いつでも変更可能"
description: "v6.1.0 は Browser MCP を自動で install しません。Install 時に none / playwright / bsk の中から1つを選択します。AIOS は選択した engine だけを使います。Default は最も重い方です。つまり off です。"
date: 2026-09-23
tags: ["AIOS", "browser-mcp", "memory", "default-off", "release", "v6.1.0"]
---

# v6.1.0: Browser MCP Off by Default — Install時に1つ選択、いつでも変更可能

> **Quick Answer:** 前は browser automation が default で on でした。すべての machine に full の Browser MCP が materialize されました。各 client の Browser MCP は Chrome を start します。しかし framework はそれを完全に release できませんでした。v6.1.0 は default を off にします。Install 時に **`none`** / **`playwright`** / **`bsk`** の中から1つを選択します。AIOS は選択した engine を使います。この choice は settings に残ります。1つの command でいつでも変えることができます。各 client の writer はすべてこれを使います。重い方が default になったので、install しただけで default が軽くなります。

## The problem: Start したら止まらない自動化

Workflow は browser を動かすことができます。足りないのは能力ではありません。**Cost** です。そしてその cost を誰が払うかです。

1. **Browser を使わない machine も cost を払いました。** Browser MCP は `.mcp.json` を materialize する時に default で on でした。ですから AIOS を install した時に、使う使わないにかかわらず、設定に browser の runtime が入ります。
2. **Memory の cost は実際にあります。そして増えます。** 最近の check で、主な重さは ~75 の process ではありません。**7 つの `browser-mcp` がそれぞれ Chrome を start しています。** 数百MB ずつです。Page を見ない session も cost を使います。
3. **死んだ client は自分で release できませんでした。** `ctx-agent` は `spawnSync` の shell です。そして後始末をしません。ですから browser が一度 start すると、framework には release する方法がありません。Idle の時に release する方法もありません。
4. **出口がありませんでした。** Browser automation を使いたい人は、作られた設定を手で消さなければなりませんでした。実際の人はそんなことをしません。

今回の fix の目的は browser を choice 制にすることです。そして必要な時に各 agent が別々に動くことです。そして user に1つの switch を用意することです。

## v6.1.0 で変わったこと

### 1. Default で Browser MCP を入れない

Browser MCP は install 時に自動で on になりません。Default は **`none`** です。Operator が選択するまで、browser に関する行は設定に書きません。最も重い方を default にするのは故意です。Browser を使いたい時だけ入れます。要らなければ cost を払いません。

これは browser automation が optional ではありません。Browser automation が **explicit** です。要る時にはすべてあります。要らなければ framework は自分から on にしません。

### 2. Install 時に3つの中から1つ選択、3つの mode は1つだけ

Install 時に（またはいつでも）1つだけ選択します：

| mode | 提供するもの | いつ選択するか |
| --- | --- | --- |
| **`none`**（default） | Browser MCP を入れない。Chrome も browser の name もゼロ。 | ほとんどの user。Browser は使う時に使う tool です。いつも on ではありません。 |
| **`playwright`** | リポジトリの中の Node/Playwright runtime（各 agent が別々に start）+ launch snippet。 | Program で browser を制御したい時。Playwright の分離が要る時。 |
| **`bsk`** | 人が使う session 式自動化：Login した Chrome を extension + local daemon で使う。 | 人の session が要る時。人が request に答えながら drive する時。 |

3つは構造上1つだけです。選択した engine だけが client に materialize されます。変えると古い name を落とします。古いものも消します。

### 3. Mode の interface：Writer が end to end で使う

全体がすべての writer が使う `mcp-mode.mjs` にあります：

- `browserManagedServer` は `none` と `bsk` に対して `null` を返します。各 client の設定から **browser の name が drop** されます。**古いものが削除** されます——Cod TOML、OpenCode、Hermes YAML、ZCode、Gemini、そして共有の migration path です。
- **Playwright だけの runtime check** は gate で止まります。`none`/`bsk` を選択するとリポジトリの中の Node/Playwright installer を skip します。
- 各 writer は設定から mode を `resolveBrowserMode` で読みます。そしてそれを使って materialize します。ですからこの choice は全 client で同じです。

### 4. 1つの command でいつでも変えることができる

Mode は settings の中の1つの data です。ですから lock されません：

```bash
aios internal browser switch playwright   // または：bsk | none
```

この1つの command は **全 client** に再 materialize します。同じ `mcp-migrate` の path を使います。現在の client も1度で新しい engine に変えます。`bsk` に変えると AIOS は3 step の guide（CLI → extension を入れて Connect → run）と `browser_*` → `bsk` の tool map を出します。`playwright` に戻すと guide は消えます。

### 5. BSK：警告だけ、壊れない connectivity baseline

BSK は人が使う session 式 browser automation です——Extension と local daemon で login した Chrome を使います。Playwright とは1つだけです。CLI・daemon・extension の3つが同じ version である必要があります。ですから v6.1.0 は「connectivity あり」と言いません。Connectivity baseline を見る `bsk-doctor` を用意しました：

```bash
aios internal browser bsk-doctor
```

- `bsk status --json` を読みます。`version_skew:false` を良い baseline とします（CLI/daemon/extension がすべて同じ version）。
- `bsk` CLI が無ければ **警告だけ** します（owner action：`install.ps1 --browser bsk` を run）。そして次へ進みます。Session を壊しません。
- Daemon がまだ connectivity していなければ「Connect」を押すように言います。そして続けます。

これは故意です。壊れる doctor は「まだ connectivity しない」を「blocker」に変えます。Browser doctor は促すべきです。止めるべきではありません。

## なぜこれが Traditional な agent より良いか

Traditional な coding agent は install した瞬間にすべてを install します。そして install したまま止まりません——Chrome はいつも動き、name は設定に残り、きれいに止める方法がありません。AIOS はすでに flow を動かし contract を守ってきました——**しかし「default で何を入れるか」はいつも owner の decision ではありませんでした**——ただ default で on でした。

v6.1.0 はこの gap を埋めます：**Install 自体が decision になります**。Browser の engine を選択します。Framework は要る分だけ materialize します。要らない分は書きません。Writer は全 client で同じです。変えたくなったら1つの command で終わりです。これが「すべてを on にする agent」と「求めたものだけを on にする agent」の違いです。

## Reference materials

- Install 時の question、`switch` command、BSK guide は `scripts/lib/components/browser/`（`mcp-mode.mjs`、`switch.mjs`、`prompt.mjs`、`bsk-writer.mjs`）にあります。
- `bsk-doctor` connectivity baseline と全 test は `scripts/tests/bsk-writer.test.mjs`（14 cases）+ browser/mcp writer の test にあります。
- 完全な release plan、scope、そして 6.1.0 の version decision（minor → `6.1.0`）は `docs/plans/release-6-1-0-browser-default-off-and-lighter-sessions.md` にあります。
- Verification：57 case の target test が通っています（wiring guard W1–W6 は追加の各 CLI command が実際に reach できることを保証します）。実際の command `aios internal browser switch bsk` は全9つの client を materialize します。End to end で guide を出します。

> **Note:** この日本語版は AI が制約語彙で作成した草案です。公開前に日本語話者による確認をおすすめします。
