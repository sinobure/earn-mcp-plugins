# kw-rss-mcp

[![CI](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kw-rss-mcp.svg)](https://www.npmjs.com/package/kw-rss-mcp)

> `rss-mcp` / `rss-reader-mcp` は既に別作者により公開済みのため、本パッケージは `kw-rss-mcp` という名前で npm 配布しています。

RSS/Atom フィードを取得・検索できる MCP (Model Context Protocol) サーバーです。  
**APIキー不要・外部依存なし**（Node.js 標準の `fetch` のみ使用）、XML パースも内製実装です。

## インストール

```bash
npm install -g kw-rss-mcp
```

## Claude Desktop への登録

`claude_desktop_config.json` に以下を追加してください。

**設定ファイルの場所**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rss": {
      "command": "kw-rss-mcp"
    }
  }
}
```

npx で使う場合:

```json
{
  "mcpServers": {
    "rss": {
      "command": "npx",
      "args": ["-y", "kw-rss-mcp"]
    }
  }
}
```

## 提供ツール

### `fetch_feed`

RSS/Atom フィード URL から直近の記事一覧（最大 50 件）を取得します。  
結果は **5分間キャッシュ**されます。

| パラメータ | 型 | 説明 |
|---|---|---|
| `url` | string | RSS または Atom フィードの URL（http/https のみ） |

**使用例（Claude への質問）**
> 「Zenn の最新記事を教えて」

**レスポンス例**
```
Feed: Zenn (type: rss, 20 articles)

[0] TypeScript 5.5の新機能まとめ
    Link: https://zenn.dev/...
    Date: Thu, 01 Jan 2025 00:00:00 GMT
    Summary: TypeScript 5.5 では...
```

---

### `get_article`

指定フィードの n 番目の記事の詳細情報を返します。  
`fetch_feed` でインデックス番号を確認してから使用してください。

| パラメータ | 型 | 説明 |
|---|---|---|
| `feed_url` | string | RSS または Atom フィードの URL |
| `index` | number | 記事のゼロ始まりインデックス |

**使用例（Claude への質問）**
> 「Zennフィードの3番目の記事を見せて」

---

### `search_feed`

フィード内の記事をキーワードで検索します（タイトル・サマリー対象、大文字小文字を区別しない）。

| パラメータ | 型 | 説明 |
|---|---|---|
| `url` | string | RSS または Atom フィードの URL |
| `keyword` | string | 検索キーワード |

**使用例（Claude への質問）**
> 「ZennフィードでTypeScriptに関する記事を探して」

---

### `list_popular_feeds`

日本語技術ブログを中心とした代表的な RSS/Atom フィード一覧（10件）を返します。

| フィード名 | 言語 |
|---|---|
| Zenn | 日本語 |
| Qiita | 日本語 |
| はてなブックマーク IT | 日本語 |
| Publickey | 日本語 |
| gihyo.jp | 日本語 |
| ITPro（日経クロステック） | 日本語 |
| AWS News Blog | 英語 |
| Google Developers Blog | 英語 |
| Hacker News | 英語 |
| Dev.to | 英語 |

**使用例（Claude への質問）**
> 「おすすめのRSSフィード一覧を教えて」

## 対応フォーマット

| フォーマット | 対応状況 |
|---|---|
| RSS 2.0 | 対応 |
| Atom 1.0 | 対応 |
| CDATA セクション | 対応 |
| HTML エンティティ | 対応（`&amp;`, `&lt;` 等） |

## セキュリティ

- `http` / `https` URL のみ許可
- `localhost`・プライベートアドレス（192.168.x.x, 10.x.x.x 等）へのアクセスを拒否（SSRF 対策）
- タイムアウト 10 秒

## キャッシュ

同一 URL のフィードは **5分間** メモリキャッシュされます。  
キャッシュ期間中は同じ URL への再リクエストで外部アクセスが発生しません。

## ローカル開発

```bash
git clone <repo>
cd rss-mcp
npm install
npm run build     # dist/ を生成
npm start         # サーバー起動（stdio モード）
```

## ライセンス

MIT
