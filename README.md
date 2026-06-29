# ハロコレ URL保存サポーター

Chrome拡張「ICAL Dual Copier & Downloader」を、スマホで使いやすい静的Webアプリ/PWAとして作り替えたものです。

## できること

- `cdn.orical.jp/cards/.../frontimage/...` の開始URLと終了URLから連番候補を生成
- ★1〜★5、`jpg/mp4`、枝番 `_1`/`_2` を検出
- 見つかったURLのコピー、共有、個別オープン、保存リンク表示
- CORSが許可される場合のみZIP作成
- スマホ向けブックマークレットで詳細ページからカードURLを抽出
- PWAとしてホーム画面に追加可能

## 注意

WebアプリはChrome拡張と違い、他サイトのページへ自動でボタンを差し込むことはできません。
そのため、詳細ページからURLを拾う部分はブックマークレットまたは手動コピーで補助します。

## 使い方

1. このフォルダをWebサーバーまたはGitHub Pagesに置く
2. `index.html` をスマホで開く
3. 開始カードURLと終了カードURLを貼る
4. 「候補を検出」を押す
5. URL一覧コピー、共有、ZIP作成、個別保存を使う

## GitHub Pagesに置く場合

1. リポジトリを作る
2. このフォルダの中身をアップロード
3. GitHubの Settings → Pages → Deploy from a branch を選択
4. `main` / root を選択して公開

