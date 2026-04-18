# earn-mcp-plugins

Model Context Protocol (MCP) プラグイン集。Claude Desktop / Claude Code / Cursor などの MCP 対応クライアントで動きます。

## 収録プラグイン

| ディレクトリ | npm パッケージ名 | 概要 |
|---|---|---|
| [exchange-rate-mcp](./exchange-rate-mcp/) | `fx-rate-mcp` | 為替レート取得（open.er-api.com、APIキー不要） |
| [notion-lite-mcp](./notion-lite-mcp/) | `notion-lite-mcp` | Notion軽量連携（search / get / append / list_children） |
| [time-mcp](./time-mcp/) | `kw-time-mcp` | 時刻・タイムゾーン変換・日本の祝日判定 |
| [rss-mcp](./rss-mcp/) | `kw-rss-mcp` | RSS/Atomフィード取得 |
| [markdown-to-pdf-mcp](./markdown-to-pdf-mcp/) | `md2pdf-mcp` | Markdown → 印刷最適化HTML 変換 |

## 共通仕様

- **依存最小化**: APIキーなしで動作するものを優先（Notion のみトークン必須）
- **TypeScript strict + @modelcontextprotocol/sdk ^1.29**
- **入力バリデーション**: ISO 4217 / UUID / IANA TZ 等を検証
- **stdout汚染なし**: ログは stderr のみ、JSON-RPC プロトコルを壊さない
- **テスト済み**: 各プラグインに Vitest 単体テスト（合計 89 テスト、全 PASS）

## セットアップ（プラグイン共通パターン）

```bash
# 個別のプラグインディレクトリに入って
cd exchange-rate-mcp
npm install
npm run build
npm test
```

## Claude Desktop / Code への登録

各プラグインの README を参照。典型的には `claude_desktop_config.json` に以下を追記:

```json
{
  "mcpServers": {
    "fx-rate": {
      "command": "npx",
      "args": ["-y", "fx-rate-mcp"]
    }
  }
}
```

## ライセンス

各プラグイン MIT License (Kento Watarai)。

## 公開

`npm publish --access public` は各ディレクトリで個別実行。一括なら:

```bash
# 親ディレクトリから
cd ..
bash mcp-plugins/../mcp-plugins/publish-all.sh   # 誤記注意: 正しくは mcp-plugins/publish-all.sh
```

CI（GitHub Actions）は push / PR で自動的に 5 プラグイン並列でテストします。
