# apishape

[English](README.md) · [Português](README.pt-BR.md) · 日本語

JSON API の **破壊的変更** をユーザーより先に検出します。apishape は各レスポンスの *形*（フィールドのパスと型）を保存し、フィールドが消えたり型が変わったりすると CI を失敗させます。

スナップショットには **値が一切含まれない**（メール・ID・トークンなし）ので、安全にコミットできます。OpenAPI 不要・依存ゼロ。

```bash
npx @guihakka2/apishape https://api.example.com/v1/users     # 初回はスナップショット保存、以降は比較
npx @guihakka2/apishape https://api.example.com/me -H 'Authorization: Bearer ${API_TOKEN}'
npx @guihakka2/apishape                                       # apishape.json の全エンドポイント
```

- **破壊的**：フィールド削除、型の変更（`null` 許容になる場合も含む）、HTTP ステータスの変化
- **非破壊的**：新しいフィールド（`--strict` 時のみ失敗）、今回空だった配列、常に `null` だったフィールドに値が入った場合
- **セキュリティ**：`${VAR}` は環境変数から読み、表示も保存もしない。URL はクエリ文字列なしで表示。リダイレクトは追わない。レスポンスは 10 MB まで

オプション：`--update`、`--strict`、`-H`、`--name`、`--config`、`--timeout`、`--json`。詳細は [英語版 README](README.md) と [SECURITY.md](SECURITY.md) を参照。

**Node.js がなくても使えます：** 各[リリース](https://github.com/Guihakka2/apishape/releases/latest)に Windows・macOS・Linux（x64 / ARM）用のプログラムがあります。ダウンロードして展開し、ターミナルで `apishape` を実行してください。GitHub Actions でビルドされ、`SHA256SUMS.txt` とビルド来歴の証明付き。まだ有料の署名はないため、初回は Windows の SmartScreen（「詳細情報」→「実行」）、macOS では `xattr -d com.apple.quarantine apishape` を一度実行してください。
