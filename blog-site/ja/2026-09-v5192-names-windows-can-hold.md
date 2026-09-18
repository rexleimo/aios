---
title: "v5.19.2：Windows が扱える名前"
description: "候補 id は正当に 'session:<id>' である。NTFS でこれをファイル名に使うと代替データストリームになり、書き込みは成功したように見え、readdir には決して現れず、昇格レコードは失われる。それでも取り込み側はエラー 0 件と報告する。"
date: 2026-09-18
tags: ["AIOS", "evolution", "windows", "filesystem", "testing", "release", "v5.19.2"]
---

# v5.19.2：Windows が扱える名前

エンティティ id とファイル名は別物である。ほとんどの場合その差は見えないので両者は混用され、そしてあるプラットフォームが静かに異を唱える。

このリポジトリでは候補 id は `session:<sessionId>` である。この形はテストスイートが断言しており、データモデルの一部であり、変える予定はない。その id をそのままファイル名として使った箇所が三つあった。

## 成立しないコロン

`session:eval-001.json` は POSIX ではごく普通のファイル名である。NTFS ではファイル名ですらない。コロンより後ろはすべて `session` というファイルの**代替データストリーム（ADS）**になる。

これはクラッシュより悪い失敗の形を生む。Windows では：

```
writeFile('...promotions/session:session-import-0.json')  -> 成功
readdir('...promotions/')                                 -> []
```

書き込みは成功を報告する。ディレクトリ一覧には現れない。`readPromotion` は見つけられず、`listPromotions` は空配列を返し、「三件の昇格を書いた」取り込み側は `errors.length === 0` と報告する。

レコードは保存されておらず、それを告げるものも何もなかった。

## 三人の書き手、三つの結果

同じ id が三つの経路でファイルシステムに到達していた：

**判定（verdicts）** は生の id でファイルを命名し、原子的なリネームで書いた。一時ファイルはストリームとして作られ、最終のストリームパスへのリネームが `EINVAL: invalid argument, rename '...\.session:session-eval-001.json...'` で失敗した。少なくとも音はした —— ただし Windows でだけ。

**昇格（promotions）** はもっと悪い。`promotionPath()` は id を浄化してからパスを組むが、その許可リストは `[^A-Za-z0-9._:-]` であり、**コロンを残す**。ストアはストリームに書き、`readdir` は決して見ず、昇格は消えた。

**統合ブリッジ（integration）** は二つ目の書き手を自前で書いていた：

```js
const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', `${promotionId}.json`);
await fs.writeFile(target, JSON.stringify(promotion, null, 2), 'utf8');
```

この経路は `promotionPath()` を完全に迂回していた —— 一つの成果物に二人の書き手、一致するのは運だけによる。

## 修正

派生した名前は浄化し、id はデータとしてコロンを保つ。

```js
// scripts/lib/fs/file-segment.mjs
const ILLEGAL_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
export function sanitizeFileSegment(segment) {
  return String(segment ?? '').replace(ILLEGAL_FILE_NAME_CHARS, '-');
}
```

この文字クラスはここで発明したものではない。memo ストレージ層が自分のパスに対して同じ集合をすでに正規化していた。ただしそれらのヘルパーは小文字化と空白の畳み込みも行うため、不透明な id には使えない —— これはファイル名が保持できない文字だけを除く。

結果は三つ。`writeVerdict`/`readVerdict` は導出した名前を浄化するので、互いに一致したままである。`promotionPath()` は許可リストからコロンを外し、結果を浄化器に通して保険とした。`writePromotion` はエクスポートされ、統合ブリッジは自前のパスではなくそれを呼ぶ。

さらに背後にもう一つあった。`atomicWriteText` は一時ファイル名の式を複製しながら、もう一方の原子的書き込みが持つ後始末を持たなかったため、失敗したリネームがストリームの残骸をディスクに残していた。現在は `writeFileAtomic` に委譲し、実装は二つから一つになった。

## 一時ディレクトリの中にしか存在しない失敗

`scripts/lib/fs/` にファイルを一つ加えると release-preflight の三つのテストが壊れた —— しかもそのコマンドをワークツリーで手で走らせると `exit 0` になる。リリース用のフィクスチャは `scripts/lib/fs/atomic-write.mjs` を**明示的な単一ファイル**として複製していたため、このモジュールが新しい兄弟を import した瞬間、フィクスチャ実行は毎回**一時ルート**の中で `agent export regeneration failed` で死んだ。

最初の直感は「自分の変更とは無関係」だった。それは推測なので、測定に切り替えた。変更したファイルを前のコミットに戻して同じテストを走らせると通り、戻すと落ちる。直感は間違っていた。フィクスチャは `scripts/lib/clients` と同じくディレクトリごと複製するようになった。

## 正直な状態：直したが、まだ配線していない

`evolution-integration.test.mjs` は五つの失敗から終了コード 0 になった。それでもどのテスト入口からも到達できない —— つまりこの修正はまだ CI に守られていない。緑なのは、誰も走らせていないからである。

これが次の段階であり、独立した段階である。`scripts/tests/` の 82 個のテストファイルはどの入口からも到達できず、通る前にスイートへ配線すればゲートが赤くなるだけだ。まず直し、次に配線し、最後にベースラインを縮める。

## 検証

- `node --test scripts/tests/evolution-integration.test.mjs` —— 五つの失敗から終了コード 0
- `scripts/tests/artifact-filename-windows-safety.test.mjs` —— 新規、配線済み、五つのケースで不変条件を POSIX 上でも固定する（そこではこの失敗は再現しない）
- `npm run test:scripts` —— 1293 tests、1285 pass、0 fail
