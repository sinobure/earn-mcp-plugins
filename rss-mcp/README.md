# kw-rss-mcp

[![CI](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kw-rss-mcp.svg)](https://www.npmjs.com/package/kw-rss-mcp)

> `rss-mcp` / `rss-reader-mcp` は既に別作者により公開済みのため、本パッケージは `kw-rss-mcp` という名前で npm 配布しています。

RSS/Atom フィードを取得・検索できる MCP (Model Context Protocol) サーバーです。  
**APIキー不要**。外部サービスへの登録は不要で、RSS 2.0 / Atom 1.0 / RSS 1.0 (RDF) を取得・検索できます。
実行時依存は `@modelcontextprotocol/sdk` と XML パーサー `fast-xml-parser` のみです。

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

Claude Code の場合:

```bash
claude mcp add rss -- npx -y kw-rss-mcp
```

npx で使う場合（Claude Desktop）:

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

RSS/Atom/RDF フィード URL から直近の記事一覧（最大 50 件）を取得します。フィードに 50 件を超える記事がある場合は、その旨が出力に明記されます。  
結果は **5分間キャッシュ**されます。

| パラメータ | 型 | 説明 |
|---|---|---|
| `url` | string | RSS / Atom / RDF フィードの URL（公開 http/https のみ） |

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

指定フィードの n 番目の記事を返します。フィードが提供する本文（`content:encoded` / `content` / `description`）をプレーンテキスト化して返します（最大 20,000 文字）。リンク先の Web ページ自体は取得しません。  
`fetch_feed` でインデックス番号を確認してから使用してください。

| パラメータ | 型 | 説明 |
|---|---|---|
| `feed_url` | string | RSS または Atom フィードの URL |
| `index` | integer | 記事のゼロ始まりインデックス（0〜49） |

**使用例（Claude への質問）**
> 「Zennフィードの3番目の記事を見せて」

---

### `search_feed`

フィード内（最新 50 件）の記事をキーワードで検索します（タイトル・サマリー・本文が対象、大文字小文字を区別しない）。

| パラメータ | 型 | 説明 |
|---|---|---|
| `url` | string | RSS または Atom フィードの URL |
| `keyword` | string | 検索キーワード |

**使用例（Claude への質問）**
> 「ZennフィードでTypeScriptに関する記事を探して」

---

### `list_popular_feeds`

日本語技術ブログを中心とした代表的な RSS/Atom フィード一覧（10件）を返します。各 URL は 2026-10-13 に HTTP 200 で取得できることを確認済みで、確認日が出力に含まれます。

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
| RSS 2.0 | 対応（`content:encoded` 含む） |
| Atom 1.0 | 対応 |
| RSS 1.0 (RDF) | 対応（`dc:date` 含む） |
| CDATA / HTML エンティティ | 対応（二重デコードなし、Unicode 補助平面の文字参照も対応） |
| 文字コード | Content-Type または XML 宣言の `charset`（Shift_JIS / EUC-JP 等）に対応 |

不正な XML や、フィードではない HTML ページは成功扱いにせず、エラー（`isError`）で返します。

## セキュリティ

- `http` / `https` のみ許可。URL 内の認証情報（`user:pass@`）は拒否
- SSRF 対策: ループバック・プライベート・リンクローカル（クラウドのメタデータ `169.254.169.254` 含む）・CGNAT・予約・マルチキャストの IPv4 / IPv6 を `net.BlockList` で拒否（IPv4 マップド IPv6 も判定）
- ホスト名は DNS 解決後の**全アドレス**を接続時に検証し、検証した IP にそのまま接続（DNS rebinding 対策）
- リダイレクトは手動で追従し（最大 5 回）、**各リダイレクト先を再検証**
- レスポンスは最大 **5MB**（展開後・ストリーム読みで超過時に中断）
- タイムアウト 10 秒（本文の読み込み完了まで）
- XML の `<!ENTITY>` 宣言を含む文書は拒否（XXE / entity expansion 対策）。DTD の外部読み込みは行いません

> 注意: この対策は MCP サーバー自身が内部ネットワークへ到達することを防ぐものです。HTTP プロキシ用の環境変数 (`HTTP_PROXY` 等) は使用しません。

## キャッシュ

同一 URL のフィードは **5分間** メモリキャッシュされます（最大 50 件、古いものから破棄）。  
キャッシュ期間中は同じ URL への再リクエストで外部アクセスが発生しません。

## ローカル開発

```bash
git clone https://github.com/sinobure/earn-mcp-plugins.git
cd earn-mcp-plugins/rss-mcp
npm install
npm run build     # dist/ を生成
npm test          # ユニットテスト
npm start         # サーバー起動（stdio モード）
```

## ライセンス

MIT
