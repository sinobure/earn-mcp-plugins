# notion-lite-mcp

[![CI](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/notion-lite-mcp.svg)](https://www.npmjs.com/package/notion-lite-mcp)

Notion の公式 SDK を使い、Claude Desktop / Claude Code からページの検索・読み取り・追記ができる軽量 MCP サーバーです。

> **第6.1章と連動**: Kindle本「実践MCP開発入門」第6章の実装例をベースに、`list_children` ツールを追加した実用版です。

---

## 必要なもの

- Node.js 18 以上
- Notion Integration（内部インテグレーション）のシークレットキー

---

## Notion Integration の作成手順

### 1. インテグレーションを作成する

1. [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) にアクセス
2. 「新しいインテグレーション」をクリック
3. 名前を入力（例: `Claude MCP`）し、ワークスペースを選択
4. 「送信」をクリック
5. 表示された **「内部インテグレーションシークレット」** をコピーして保存する

### 2. ページをインテグレーションに共有する

Notion の各ページ（またはデータベース）はデフォルトでインテグレーションからアクセスできません。  
アクセスしたいページを開いて共有設定を行います。

1. 対象ページの右上「…」メニュー → 「コネクト」をクリック
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
        "NOTION_API_KEY": "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
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
        "NOTION_API_KEY": "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Claude Code への登録

```bash
claude mcp add notion-lite -e NOTION_API_KEY=secret_xxxx -- npx -y notion-lite-mcp
```

または設定ファイル（`.claude/settings.json`）に直接追記:

```json
{
  "mcpServers": {
    "notion-lite": {
      "command": "npx",
      "args": ["-y", "notion-lite-mcp"],
      "env": {
        "NOTION_API_KEY": "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## 提供ツール

### `search_notion`

Notion 内のページ・データベースをキーワードで検索します。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `query` | string | はい | 検索キーワード |
| `limit` | number | いいえ | 最大取得件数（1〜100、デフォルト: 10） |

**使用例（Claude への質問）**
> 「Notionで「議事録」というページを探して」

**レスポンス例**
```
Search results for "議事録" (2 found):

[page] 2024年4月 議事録
  id: 1234abcd-12ab-12ab-12ab-1234abcd5678
  url: https://www.notion.so/...
  last edited: 2024-04-10

[page] 2024年3月 議事録
  id: 5678efgh-56ef-56ef-56ef-5678efgh9012
  url: https://www.notion.so/...
  last edited: 2024-03-28
```

---

### `get_page`

指定したページの本文をテキストとして取得します。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `page_id` | string | はい | NotionページID（ハイフンあり・なし両対応） |

対応ブロックタイプ: heading 1/2/3、paragraph、bulleted/numbered list、to-do、toggle、code、quote、callout、divider

**使用例（Claude への質問）**
> 「page_id が 1234abcd-12ab-12ab-12ab-1234abcd5678 のページを読んで」

**レスポンス例**
```
# プロジェクト計画書
(id: 1234abcd-12ab-12ab-12ab-1234abcd5678)

## 概要
このプロジェクトでは...

- タスク1
- タスク2

[x] 完了済み項目
[ ] 未完了項目
```

---

### `append_to_page`

既存ページの末尾にテキストを追記します。改行ごとに個別の段落ブロックとして追加されます。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `page_id` | string | はい | NotionページID |
| `content` | string | はい | 追記するテキスト（改行で段落を分割） |

**使用例（Claude への質問）**
> 「1234abcd-... のページに「本日の作業完了」と追記して」

**レスポンス例**
```
Successfully appended 1 paragraph(s) to page 1234abcd-12ab-12ab-12ab-1234abcd5678.
Preview:
  本日の作業完了
```

---

### `list_children`

指定したページまたはブロックの直下の子ブロック一覧を取得します。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `block_id` | string | はい | NotionページID またはブロックID |

**使用例（Claude への質問）**
> 「このページのブロック構造を確認して: 1234abcd-...」

**レスポンス例**
```
Child blocks of 1234abcd-12ab-12ab-12ab-1234abcd5678 (5 total):

1. [heading_1] # プロジェクト計画書
   id: aaaa0001-...
2. [paragraph] このプロジェクトでは...
   id: aaaa0002-...
3. [bulleted_list_item] - タスク1
   id: aaaa0003-...
```

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

## 起動時の挙動について

`NOTION_API_KEY` が未設定の場合、サーバーは即座に終了します。

```
Fatal: NOTION_API_KEY environment variable is not set.
Create a Notion integration at https://www.notion.so/my-integrations and set the secret.
```

Claude Desktop / Code の設定ファイルで `env` に `NOTION_API_KEY` を正しく設定してください。

---

## ローカル開発

```bash
git clone <repo>
cd notion-lite-mcp
npm install
npm run build      # dist/ を生成
NOTION_API_KEY=secret_xxxx npm start
```

---

## ライセンス

MIT
