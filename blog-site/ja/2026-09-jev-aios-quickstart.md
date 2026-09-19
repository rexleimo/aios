---
title: "Jev + AIOS クイックスタート：キーワード不要、裏側で自動判断（JVM の誤解も解消）"
description: "TYPESAFE_API_KEY を設定し、aios integration add typesafe と aios judgment enable typesafe を実行したら、普段どおり話すだけで Jev（jev-latest）が裏側で判断します。導入だけでは発火しない理由、aios_judge と rex ステージゲート、予算、JVM/MVC の聞き間違いを解説。"
date: 2026-09-19
tags: ["AIOS", "TypeSafe", "Jev", "System One", "判断ゲート", "MCP", "クイックスタート", "JVM"]
---

# Jev + AIOS クイックスタート：キーワード不要、裏側で自動判断

TypeSafe 統合を入れたのに何も起きない——それは正常です。導入は Jev について学ぶことであり、**有効化**して初めて Jev が答えます。4 コマンドで最初の裏側判断まで進みます。

## 早見表

| 質問 | 答え |
| --- | --- |
| 導入したのに Jev が答えないのはなぜ？ | 統合が入れるのは**ドキュメント** MCP であり、判断を生成できません。`aios judgment enable typesafe` を実行してください。 |
| 「JVM」のようなキーワードは必要？ | 不要です。有効化後は普段どおり話すだけ。ゲートが裏側で発火します。 |
| 人が言う「JVM」/「JVM MVC」とは？ | **Jev** と **MCP** ドキュメントサーバーをまとめて聞き取ったものです。モデルは `jev-latest`、サーバーは `typesafe-docs`。 |
| 費用は？ | 判断 1 回ごとに課金 1 回。デフォルトはセッションあたり 20 回・入力 20000 文字上限。 |

## ステップ 0——二つの半分を区別する

| 半分 | 内容 | Jev を呼べるか |
| --- | --- | --- |
| `aios integration add typesafe` | 固定版スキル（`65a39f3`、sha256 検証）+ 全 9 クライアントの `typesafe-docs` MCP | 不可。ドキュメント検索のみ。 |
| `aios judgment enable typesafe` | `~/.aios/judgment/config.json` に `enabled: true` を書く | 可——`TYPESAFE_API_KEY` がある場合のみ。 |

## ステップ 1——統合を導入する

```bash
aios integration add typesafe --dry-run   # 全クライアントの変更を事前表示、書き込みなし
aios integration add typesafe             # スキル導入 + ドキュメント MCP 登録
aios integration doctor typesafe          # ハッシュ・登録・資格情報の有無を検証
```

## ステップ 2——資格情報を設定しクライアントを再起動する

`TYPESAFE_API_KEY` が唯一の秘密情報です。AIOS は有無だけを見ます。値を読む・表示する・保存することはありません。

```bash
# macOS / Linux
export TYPESAFE_API_KEY="<your-key>"                              # このシェルのみ
echo 'export TYPESAFE_API_KEY="<your-key>"' >> ~/.bashrc          # 永続化
```

```powershell
# Windows（自分のアカウントに永続）
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'User')
```

その後**コーディングクライアントを再起動**してください。環境変数はプロセス起動時に一度だけ読まれます。開きっぱなしのクライアントに後から設定した値は見えません。

## ステップ 3——ゲートを有効にする

```bash
aios judgment status           # 期待値：disabled、credential present
aios judgment enable typesafe  # ~/.aios/judgment/config.json に書き込む
aios judgment status           # 期待値：ENABLED、model jev-latest
```

任意の正直チェック（課金 1 回、あなたが明示したときだけ）：

```bash
aios judgment enable typesafe --probe
```

## ステップ 4——普段どおり話す。Jev は裏側で働く

キーワード不要、「JVM を使って」と言う必要もありません。普通に作業してください：

- リスクの高い変更を頼む。実行前にゲートが深刻度を採点し、`strict-tdd` と `tdd` を使い分けます。迷えば先にあなたに聞きます。
- 実装が一巡する。rex ステージが進む前に、ゲートは Jev に `noul` を 1 問だけ聞きます：この証拠は完了を検証可能に示しているか？ 基準未満なら理由付きで保留（hold）します。

手動で 1 回試す（戻り値の形を見る）：

```bash
aios judgment ask --state "バックアップなしで本番 sessions テーブルを削除した。" \
  --questions '{"severity":{"type":"score","instructions":"この変更のリスクは？","criteria":["無視できる","通常","リスクあり","データ喪失"]}}' \
  --risk destructive --json
```

すべての答えは**提案であり事実ではありません**：`model`・`x-typesafe-request-id`・token `usage`・確信度を持ち、`act` / `confirm` / `abort` に映射されます。破壊的変更は読み取り専用より高い確信度を要求します。ゲートの発言がコンテンツを生成したり、却下を覆したりすることはありません。

## 知っておくべき guardrail

- **デフォルトはオフ、fail closed。** 資格情報なし・フラグなし・設定破損のいずれも結果は同じ：`tools/list` に道具なし、ネットワーク呼び出しゼロ、次の手順付きの拒否。
- **二つの面、どちらも狭めるだけ。** `aios_judge` は有効時のみ出現。rex ステージゲートの答えは `advance` / `hold` のみ。動作を緩めることはできません。
- **支出は監査可能。** 毎回 `requestId` + `usage` + 呼び出し元を記録。
- **ベンダー障害時はデフォルトで保留**します。あなたが自分で開けたゲートだからです。障害時も通したい場合は `onJudgmentError` を `"allow"` に。

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| 導入済みなのに発火しない | 有効化までは正常：`aios judgment enable typesafe` |
| `credential ... (NOT SET)` | クライアントの実環境に `TYPESAFE_API_KEY` を設定し、クライアントを再起動 |
| `ask` が `judgment-disabled` | 先に有効化。終了コード 3 は「未有効」であり「故障」ではない |
| Agent が「JVM モデル」と言う | Jev（`jev-latest`）のこと。そのまま使って問題なし |

## 次の手順

- [AIOS で TypeSafe Jev を使う](https://cli.rexai.top/ja/integrations/)——リファレンス。
- [v5.19.0：判断ゲートに身体を与える](2026-09-v519-judgment-gate-surfaces.md)——無効時に道具が欠席する理由。
- [v5.18.0：デフォルトはオフ、意図的に](2026-09-v518-judgment-gate.md)——fail closed 設計。
