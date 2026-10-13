# fx-rate-mcp

[![CI](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/fx-rate-mcp.svg)](https://www.npmjs.com/package/fx-rate-mcp)

リアルタイム為替レートを取得する MCP (Model Context Protocol) サーバーです。  
[open.er-api.com](https://open.er-api.com) の無料エンドポイントを使用するため、APIキー不要で利用できます。

> **⚠️ 無料プランの制限**: open.er-api.com の無料プランは **月1,500リクエスト** が上限です。超過時は HTTP 429 が返り、キャッシュが切れた以降のリクエストが失敗します。商用利用・大量呼び出しが想定される場合は、このサーバーを使わず有料の為替APIを直接利用することを検討してください。

## インストール

```bash
npm install -g fx-rate-mcp
```

## Claude Code への登録

```bash
claude mcp add fx-rate -- npx -y fx-rate-mcp
```

## Claude Desktop への登録

`claude_desktop_config.json` に以下を追加してください。

**設定ファイルの場所**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "fx-rate": {
      "command": "fx-rate-mcp"
    }
  }
}
```

グローバルインストールせずに npx で使う場合:

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

## 提供ツール

### `get_exchange_rate`

通貨ペアの現在レートを取得します。基準通貨ごとにレート表を5分間キャッシュします。

| パラメータ | 型 | 説明 |
|---|---|---|
| `from` | string | 変換元通貨コード（例: `USD`） |
| `to` | string | 変換先通貨コード（例: `JPY`） |

**使用例（Claude への質問）**
> 「USD から JPY のレートを教えて」

**レスポンス例**
```
1 USD = 158.544079 JPY
Data updated: 2026-10-13T00:02:31.000Z (provider updates about once a day; reference values only)
```

---

### `convert_currency`

金額を別の通貨に変換します。小数桁は変換先通貨の標準桁数を最小とし（JPY は 0 桁、USD は 2 桁など）、最大4桁まで表示します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `amount` | number | 変換する金額 |
| `from` | string | 変換元通貨コード |
| `to` | string | 変換先通貨コード |

**使用例（Claude への質問）**
> 「1000ドルを日本円に換算して」

**レスポンス例**
```
1000 USD = 158,544.079 JPY (rate: 1 USD = 158.544079 JPY)
Data updated: 2026-10-13T00:02:31.000Z (provider updates about once a day; reference values only)
```

---

### `list_currencies`

レート提供元が対応する全通貨（約160）のコードと英語名を一覧表示します。

**使用例（Claude への質問）**
> 「対応している通貨を教えて」

**レスポンス例**
```
Supported currencies (162 total):
  AED: United Arab Emirates Dirham
  AUD: Australian Dollar
  ...
```

全ツールは読み取り専用（`readOnlyHint`）で、構造化出力（`structuredContent`）も返します。

## 注意事項・免責

- レートは open.er-api.com の日次更新データで、5分間ローカルキャッシュされます。出力の `Data updated` が提供元の更新時刻です。
- 参考値であり、取引・投資・会計判断の根拠として保証するものではありません。
- 外部APIの応答が10秒を超えるとタイムアウトします。上限超過（HTTP 429）時は専用のエラーメッセージを返します。

## ローカル開発

```bash
git clone https://github.com/sinobure/earn-mcp-plugins.git
cd earn-mcp-plugins/exchange-rate-mcp
npm ci
npm run build     # dist/ を生成
npm test          # テスト実行
npm start         # サーバー起動（stdio モード）
```

## ライセンス

MIT
