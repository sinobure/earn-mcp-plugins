# fx-rate-mcp

[![CI](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/fx-rate-mcp.svg)](https://www.npmjs.com/package/fx-rate-mcp)

> ※ `exchange-rate-mcp` は既に別作者により公開済みのため、本パッケージは `fx-rate-mcp` という名前で npm 配布しています。

リアルタイム為替レートを取得する MCP (Model Context Protocol) サーバーです。  
[open.er-api.com](https://open.er-api.com) の無料エンドポイントを使用するため、APIキー不要で利用できます。

> **⚠️ 無料プランの制限**: open.er-api.com の無料プランは **月1,500リクエスト** が上限です。超過時は HTTP 429 が返り、キャッシュが切れた以降のリクエストが失敗します。商用利用・大量呼び出しが想定される場合は [exchangerate-api.com](https://exchangerate-api.com) の有料プランを契約し、同APIのBearerトークン対応エンドポイントに差し替えてください。

## インストール

```bash
npm install -g fx-rate-mcp
```

## Claude Desktop への登録

`claude_desktop_config.json` に以下を追加してください。

**設定ファイルの場所**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "exchange-rate": {
      "command": "fx-rate-mcp"
    }
  }
}
```

グローバルインストールせずに npx で使う場合:

```json
{
  "mcpServers": {
    "exchange-rate": {
      "command": "npx",
      "args": ["-y", "fx-rate-mcp"]
    }
  }
}
```

## 提供ツール

### `get_exchange_rate`

通貨ペアの現在レートを取得します。同一通貨ペアは5分間キャッシュされます。

| パラメータ | 型 | 説明 |
|---|---|---|
| `from` | string | 変換元通貨コード（例: `USD`） |
| `to` | string | 変換先通貨コード（例: `JPY`） |

**使用例（Claude への質問）**
> 「USD から JPY のレートを教えて」

**レスポンス例**
```
1 USD = 149.85 JPY
```

---

### `convert_currency`

金額を別の通貨に変換します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `amount` | number | 変換する金額 |
| `from` | string | 変換元通貨コード |
| `to` | string | 変換先通貨コード |

**使用例（Claude への質問）**
> 「1000ドルを日本円に換算して」

**レスポンス例**
```
1000 USD = 149,850.00 JPY (rate: 1 USD = 149.85 JPY)
```

---

### `list_currencies`

対応している主要通貨の一覧を表示します。

**使用例（Claude への質問）**
> 「対応している通貨を教えて」

**レスポンス例**
```
Supported currencies (15 total):
  USD: US Dollar
  EUR: Euro
  JPY: Japanese Yen
  ...
```

## 対応通貨（主要15通貨）

| コード | 通貨名 |
|---|---|
| USD | 米ドル |
| EUR | ユーロ |
| JPY | 日本円 |
| GBP | 英ポンド |
| AUD | 豪ドル |
| CAD | カナダドル |
| CHF | スイスフラン |
| CNY | 中国人民元 |
| HKD | 香港ドル |
| KRW | 韓国ウォン |
| SGD | シンガポールドル |
| NOK | ノルウェークローネ |
| SEK | スウェーデンクローナ |
| DKK | デンマーククローネ |
| NZD | ニュージーランドドル |

> 上記以外の通貨コードも `get_exchange_rate` / `convert_currency` で直接指定可能です（open.er-api.com が対応していれば動作します）。

## ローカル開発

```bash
git clone <repo>
cd fx-rate-mcp
npm install
npm run build     # dist/ を生成
npm start         # サーバー起動（stdio モード）
```

## ライセンス

MIT
