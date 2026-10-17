# earn-mcp-plugins

Small, dependency-light [Model Context Protocol](https://modelcontextprotocol.io) servers for Claude Desktop, Claude Code, Cursor and other MCP clients. All MIT, published on npm, no API key needed except Notion.

| npm package | What it does | Add to Claude Code |
|---|---|---|
| [`fx-rate-mcp`](https://www.npmjs.com/package/fx-rate-mcp) | Exchange rates (open.er-api.com) | `claude mcp add fx-rate -- npx -y fx-rate-mcp` |
| [`notion-lite-mcp`](https://www.npmjs.com/package/notion-lite-mcp) | Search / read / append Notion pages (needs a Notion token) | `claude mcp add notion-lite -- npx -y notion-lite-mcp` |
| [`kw-time-mcp`](https://www.npmjs.com/package/kw-time-mcp) | Current time, timezone conversion, Japanese holidays (offline) | `claude mcp add kw-time -- npx -y kw-time-mcp` |
| [`kw-rss-mcp`](https://www.npmjs.com/package/kw-rss-mcp) | Fetch and search RSS/Atom feeds | `claude mcp add kw-rss -- npx -y kw-rss-mcp` |
| [`kw-md2pdf-mcp`](https://www.npmjs.com/package/kw-md2pdf-mcp) | Markdown to print-optimized A4 HTML (save as PDF from the browser) | `claude mcp add kw-md2pdf -- npx -y kw-md2pdf-mcp` |

Japanese documentation follows below. 日本語の説明は以下です。Claude Codeで自作する方法は [Zenn本「Claude Code で作る MCP サーバー実践ガイド 2026」](https://zenn.dev/agent_craft/books/claude-code-mcp-guide-2026) にまとめています。

---

Model Context Protocol (MCP) プラグイン集。Claude Desktop / Claude Code / Cursor などの MCP 対応クライアントで動きます。

## 収録プラグイン

| ディレクトリ | npm パッケージ名 | 概要 |
|---|---|---|
| [exchange-rate-mcp](./exchange-rate-mcp/) | `fx-rate-mcp` | 為替レート取得（open.er-api.com、APIキー不要） |
| [notion-lite-mcp](./notion-lite-mcp/) | `notion-lite-mcp` | Notion軽量連携（search / get / append / list_children） |
| [time-mcp](./time-mcp/) | `kw-time-mcp` | 時刻・タイムゾーン変換・日本の祝日判定 |
| [rss-mcp](./rss-mcp/) | `kw-rss-mcp` | RSS/Atomフィード取得 |
| [markdown-to-pdf-mcp](./markdown-to-pdf-mcp/) | `kw-md2pdf-mcp` | Markdown → 印刷最適化HTML 変換 |

## 共通仕様

- **依存最小化**: APIキーなしで動作するものを優先（Notion のみトークン必須）
- **TypeScript strict + @modelcontextprotocol/sdk ^1.29**
- **入力バリデーション**: ISO 4217 / UUID / IANA TZ 等を検証
- **stdout汚染なし**: ログは stderr のみ、JSON-RPC プロトコルを壊さない
- **テスト済み**: 各プラグインに Vitest 単体テストあり(CI で実行)

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

各プラグイン MIT License。

## 公開

npm ログイン済み(`npm login`)の状態で、このディレクトリから `bash publish-all.sh` を実行します。
各パッケージを build・test・dry-run したあとに `npm publish --access public` します。
