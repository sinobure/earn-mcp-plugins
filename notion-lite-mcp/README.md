# notion-lite-mcp

[![CI](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Notion の公式 SDK を使い、Claude Desktop / Claude Code からページの検索・読み取り・追記ができる軽量 MCP サーバーです。

---

## Quick start (English)

```bash
claude mcp add notion -e NOTION_API_KEY=<your integration token> -- npx -y notion-lite-mcp
```

Tools: `search_notion`, `get_page`, `list_children`, `query_database` (filter/sorts as JSON), `append_to_page` and `create_page` (light Markdown: headings, lists, to-dos, quotes, code). Read tools retry on 429; writes never auto-retry. Search, read, query and write Notion pages via the official Notion API. Create an internal integration at https://www.notion.so/profile/integrations and share the pages with it. Tool descriptions and error hints are in English; the detailed guide below is in Japanese.

## 必要なもの

- Node.js 18 以上
- Notion Integration（内部インテグレーション）のシークレットキー

---

## Notion Integration の作成手順

### 1. インテグレーションを作成する

1. [https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations) にアクセス
2. 「新しいインテグレーション」をクリック
3. 名前を入力（例: `Claude MCP`）し、ワークスペースを選択
4. 「送信」をクリック
5. 表示された **「内部インテグレーションシークレット」** をコピーして保存する（`ntn_` で始まる文字列。以前に作成したものは `secret_` 始まりで、どちらも使えます）
6. 「機能」タブで「コンテンツを読み取る」「コンテンツを更新する」が有効か確認する（`append_to_page` には更新権限が必要）

### 2. ページをインテグレーションに共有する

Notion の各ページ（またはデータベース）はデフォルトでインテグレーションからアクセスできません。  
アクセスしたいページを開いて共有設定を行います。

1. 対象ページの右上「…」メニュー → 「コネクト」(英語UIでは Connections)をクリック
2. 作成したインテグレーション（例: `Claude MCP`）を選択
3. 「確認」してアクセスを許可

> サブページがある場合、親ページを共有すれば子ページにも自動的にアクセスできます。

---

## インストール

```bash
npm install -g notion-lite-mcp
```

または npx で使う（インストール不要）:

```bash
npx notion-lite-mcp
```

---

## Claude Desktop への登録

設定ファイルの場所:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### グローバルインストール済みの場合

```json
{
  "mcpServers": {
    "notion-lite": {
      "command": "notion-lite-mcp",
      "env": {
        "NOTION_API_KEY": "ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### npx を使う場合

```json
{
  "mcpServers": {
    "notion-lite": {
      "command": "npx",
      "args": ["-y", "notion-lite-mcp"],
      "env": {
        "NOTION_API_KEY": "ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Claude Code への登録

```bash
claude mcp add notion-lite -e NOTION_API_KEY=ntn_xxxx -- npx -y notion-lite-mcp
```

または、プロジェクト直下の `.mcp.json` に追記:

```json
{
  "mcpServers": {
    "notion-lite": {
      "command": "npx",
      "args": ["-y", "notion-lite-mcp"],
      "env": {
        "NOTION_API_KEY": "ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## 提供ツール

| ツール | 種別 | 説明 |
|---|---|---|
| `search_notion` | 読み取り | タイトルでページ/DBを検索。`limit`(1-100)、`type`(page/database)、`cursor` |
| `get_page` | 読み取り | ページ本文とプロパティをテキスト化。入れ子ブロックを `max_depth`(既定3)まで展開、`max_chars`(既定20000)で打ち切り |
| `list_children` | 読み取り | 直下の子ブロック一覧（type・プレビュー・ID） |
| `query_database` | 読み取り | DB の行を取得（タイトル・URL・主要プロパティ）。`limit`、`cursor`、`filter` / `sorts`（Notion API の JSON 文字列） |
| `create_page` | **書き込み** | 既存ページの下に新規ページを作成（`parent_page_id`、`title`、任意の `content`。書式は `append_to_page` と同じ） |
| `append_to_page` | **書き込み** | ページ末尾に追記。行頭の `# ` `## ` `### `（見出し）、`- `（箇条書き）、`1. `（番号）、`- [ ]` `- [x]`（To-do）、`> `（引用）、`---`（区切り線）、``` で囲んだ範囲（コード）を対応ブロックに変換。1行2000文字超は自動分割、100ブロックごとにバッチ送信 |

検索・DB取得は続きがあると `next_cursor` を返します。次の呼び出しの `cursor` に渡してください。

**使用例（Claude への質問）**
> 「Notionで「議事録」というページを探して」「そのページを読んで」「本日の作業完了と追記して」

**`get_page` のレスポンス例**
```
# プロジェクト計画書
(id: 1234abcd-12ab-12ab-12ab-1234abcd5678)

## 概要
このプロジェクトでは...
1. 手順1
2. 手順2
▸ 折りたたみ見出し
  中身（入れ子は2スペースずつインデント）
> 引用
[x] 完了済み項目
```

対応ブロック: 見出し1-3、段落、箇条書き、番号付き（連番）、To-do、トグル(`▸`)、引用(`>`)、コールアウト、コード、区切り線、テーブル行、数式、ブックマーク/埋め込み。画像・動画・ファイルは `[image]` 等のプレースホルダ、書式（太字・リンク等）は除いたプレーンテキストです。子ページ/子DBは展開せず ID を表示します（`get_page` / `query_database` で別途取得）。

---

## ページ ID の確認方法

Notion のページ URL から ID を取得できます。

```
https://www.notion.so/My-Page-1234abcd12ab12ab12ab1234abcd5678
                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                この32文字がページID
```

またはハイフン付き形式:
```
1234abcd-12ab-12ab-12ab-1234abcd5678
```

どちらの形式でも `notion-lite-mcp` はそのまま受け付けます。

---

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `NOTION_API_KEY is not set ...` | 設定の `env` に `NOTION_API_KEY` が無い。サーバーは起動したままツール呼び出し時にこの案内を返します。設定後にクライアントを再起動 |
| `401 unauthorized` | トークンが無効。インテグレーションのシークレットを再コピー |
| `404 object_not_found` | ページが存在しないか **インテグレーションに共有されていない**。ページの「…」→「コネクト」で追加 |
| `403 restricted_resource` | インテグレーションの「機能」で読み取り/更新が無効。有効化する |
| 検索結果が0件 | 共有済みのページしか検索できません。親ページを共有してください |
| `429 rate_limited` | 数秒待って再実行 |

---

## ローカル開発

```bash
git clone https://github.com/sinobure/earn-mcp-plugins.git
cd earn-mcp-plugins/notion-lite-mcp
npm install
npm run build      # dist/ を生成
npm test
NOTION_API_KEY=ntn_xxxx npm start
```

---

## 既知の制約

- 読み取りは書式（太字・リンク等）を落としたプレーンテキストです。ブロックの更新・削除、DB 行の作成・プロパティ更新はできません（追記と、ページ配下への新規ページ作成のみ）。
- 未対応のブロック型（synced_block など）は `[type]` と表示されます。
- 読み取り系は HTTP 429（レート制限）のとき最大2回自動リトライします。書き込みは重複を避けるため自動リトライしません。
- Notion API `2022-06-28` 固定（`@notionhq/client` v2）です。複数データソースを持つ新方式の DB には未対応です。
- エラーメッセージのヒントは英語です。

## ライセンス

MIT
