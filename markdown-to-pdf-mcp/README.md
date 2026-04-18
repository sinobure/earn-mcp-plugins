# md2pdf-mcp

[![CI](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/md2pdf-mcp.svg)](https://www.npmjs.com/package/md2pdf-mcp)

> `markdown-to-pdf-mcp` は既に別作者により公開済みのため、本パッケージは `md2pdf-mcp` という名前で npm 配布しています。

Markdown を **印刷最適化 HTML** に変換する MCP (Model Context Protocol) サーバーです。  
実際の PDF 化は「ブラウザで開いて Ctrl+P（印刷）」で行う運用を前提としており、Puppeteer 等の重い依存を持ちません。

**APIキー不要**。Markdown パースに [`marked`](https://marked.js.org/) を使用。

## インストール

```bash
npm install -g md2pdf-mcp
```

## Claude Desktop への登録

`claude_desktop_config.json` に以下を追加してください。

**設定ファイルの場所**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "md2pdf": {
      "command": "md2pdf-mcp"
    }
  }
}
```

npx で使う場合:

```json
{
  "mcpServers": {
    "md2pdf": {
      "command": "npx",
      "args": ["-y", "md2pdf-mcp"]
    }
  }
}
```

## 提供ツール

### `markdown_to_html`

Markdown 文字列を、CSS を完全内包した単一 HTML ファイルに変換します。  
返却された HTML をブラウザで開き、**Ctrl+P（Cmd+P）→ PDF として保存** で PDF を生成できます。

| パラメータ | 型 | 説明 |
|---|---|---|
| `markdown` | string | 変換する Markdown テキスト |
| `title` | string（任意） | HTML のタイトル（省略時は `Document`） |
| `theme` | string（任意） | テーマ（後述）。省略時は `default` |

**使用例（Claude への質問）**
> 「この Markdown を PDF 用 HTML に変換して」

---

### `save_as_html_file`

Markdown を変換し、指定パスに HTML ファイルとして保存します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `markdown` | string | 変換する Markdown テキスト |
| `output_path` | string | 保存先の絶対パス（`.html` / `.htm` 必須） |
| `title` | string（任意） | HTML のタイトル |
| `theme` | string（任意） | テーマ |

**使用例（Claude への質問）**
> 「この README.md の内容を `/tmp/output.html` として保存して」

---

### `convert_file`

`.md` / `.markdown` ファイルを読み込んで HTML に変換・保存します。  
`output_path` を省略するとインプットファイルと同じディレクトリに `.html` で保存されます。

| パラメータ | 型 | 説明 |
|---|---|---|
| `input_path` | string | 変換元 `.md` ファイルの絶対パス |
| `output_path` | string（任意） | 保存先の絶対パス（省略時は入力ファイルと同ディレクトリ） |
| `theme` | string（任意） | テーマ |

**使用例（Claude への質問）**
> 「`/Users/me/docs/report.md` を elegant テーマで HTML に変換して」

---

## テーマ

| テーマ | 説明 |
|---|---|
| `default` | 白背景・標準フォント。汎用レポートに最適 |
| `technical` | ダークコードブロック・等幅フォント（VS Code 風）。技術文書向け |
| `elegant` | セリフ体見出し・広い余白・ゆったりした行間。記事・書籍原稿向け |

### テーマ共通の印刷設定

- `@page { size: A4; margin: 20mm 15mm; }` で A4 出力
- `h1, h2 { page-break-after: avoid; }` で見出し直後の改ページ防止
- 孤立行（Orphan/Widow）制御済み
- テーブル・コードブロックは改ページを回避

## セキュリティ

- `..` を含むパスは拒否（パストラバーサル防止）
- 入力ファイルは `.md` / `.markdown` のみ受け付け
- 出力ファイルは `.html` / `.htm` のみ受け付け

## ローカル開発

```bash
git clone <repo>
cd markdown-to-pdf-mcp
npm install
npm run build     # dist/ を生成
npm start         # サーバー起動（stdio モード）
```

## PDF 化の手順

1. `markdown_to_html` または `save_as_html_file` で HTML を生成
2. HTML ファイルをブラウザ（Chrome / Edge 推奨）で開く
3. `Ctrl+P`（macOS: `Cmd+P`）→ 送信先を「PDF に保存」→ 印刷

> Chrome / Edge を使うと、CSS の `@page` 設定が最も忠実に反映されます。

## ライセンス

MIT
