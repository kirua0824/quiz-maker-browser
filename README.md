# クイズメーカー

教材カードから10問の小テストを作って採点するブラウザアプリです。

## ローカル起動

```bash
python3 -m http.server 4173
```

ブラウザで `http://127.0.0.1:4173/` を開きます。

## Vercel公開

1. このフォルダをGitHubに置く
2. VercelでリポジトリをImport
3. Framework PresetはOther
4. Build Commandは空、Output Directoryは `.`

## Supabase連携

Supabaseを使う場合は、`supabase-schema.sql` をSQL Editorで実行してから、`config.js` にProject URLとpublishable keyを入れます。

```js
window.QUIZ_APP_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseKey: "sb_publishable_xxx",
};
```

`service_role` キーはブラウザに入れないでください。

教材データを入れるときは、`supabase-seed.sql` をSQL Editorで実行します。
