# ハロコレ URL保存サポーター PWA

スマホ向けのハロコレ/ORICALカードURL検出・保存補助Webアプリです。

## 追加修正版

- ブックマークレットが iPhone の「Open bookmarks in a new tab」系ページへ飛ばされる問題への対策として、手動貼り付け抽出欄を追加
- 検出結果ごとに「保存」と「共有保存」を追加
- iPhone Safariで動画の `download` が効かず開くだけになる場合に、fetch → Blob/File → 共有シートを試す方式へ変更
- 取得できない場合はURLコピー＋直接オープンにフォールバック

## 使い方

1. `index.html`, `app.js`, `style.css` などを GitHub Pages / Cloudflare Pages 等にアップロード
2. スマホで開いてホーム画面に追加
3. 開始URLと終了URLを貼って「候補を検出」
4. 動画はまず「共有保存」、画像は「保存」または「ZIP作成」を試してください

## 注意

WebアプリはChrome拡張と違い、他サイトにボタンを直接差し込めません。
また、iPhone Safariはクロスオリジン動画の直接保存を制限することがあります。
その場合は「共有保存」「URL一覧コピー」を使ってください。
