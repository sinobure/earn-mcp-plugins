# md2pdf-mcp

[![CI](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/sinobure/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/md2pdf-mcp.svg)](https://www.npmjs.com/package/md2pdf-mcp)

> **重要: このサーバーは PDF を直接出力しません。** Markdown を A4 印刷向けの HTML に変換し、
> ブラウザで開いて **Ctrl+P（Cmd+P）→「PDF に保存」** で PDF にする運用です（Puppeteer 等の重い依存は持ちません）。

Markdown を **印刷最適化 HTML** に変換する MCP (Model Context Protocol) サーバーです。

**APIキー不要**。Markdown パースに [`marked`](https://marked.js.org/) を使用。

## インストール

```bash
npm install -g md2pdf-mcp
```

## Claude Code への登録

```bash
claude mcp add md2pdf -- npx -y md2pdf-mcp
# 書き込み/読み込みを許可するディレクトリを増やす場合（既定は起動ディレクトリ配下のみ）
claude mcp add md2pdf -e MD2PDF_ALLOWED_DIRS=/path/to/docs -- npx -y md2pdf-mcp
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
      "args": ["-y", "md2pdf-mcp"],
      "env": { "MD2PDF_ALLOWED_DIRS": "/Users/me/Documents" }
    }
  }
}
```

## 提供ツール

### `markdown_to_html`

Markdown 文字列を、CSS を完全内包した単一 HTML ファイルに変換します。  
返却された HTML（大きい文書は `save_as_html_file` 推奨）をブラウザで開き、**Ctrl+P（Cmd+P）→ PDF として保存** で PDF を生成できます。

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
| `output_path` | string | 保存先パス（`.html` / `.htm` 必須・許可ディレクトリ内） |
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
| `input_path` | string | 変換元 `.md` ファイルのパス（許可ディレクトリ内） |
| `output_path` | string（任意） | 保存先パス（省略時は入力ファイルと同ディレクトリ） |
| `title` | string（任意） | HTML のタイトル（省略時は入力ファイル名） |
| `theme` | string（任意） | テーマ（不正な値はエラー） |

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

- `@page { size: A4; margin: 20mm 15mm; }` で A4 出力。印刷時は画面用の `max-width`/`padding` を外し余白の二重取りを防止
- 見出し直後の改ページ・孤立行（orphans/widows）を抑制。表は行単位、画像は単位で分割回避し、**長い表・コードブロックは複数ページに分割**（表ヘッダは各ページで繰り返し）
- `technical` テーマは画面では暗背景、**印刷時は白背景**に切り替え
- 印刷時、http(s) リンクは URL を括弧書きで併記

## セキュリティ

- **読み書きできるのは許可ディレクトリ配下のみ**。既定は MCP サーバーの起動ディレクトリ（cwd）。`MD2PDF_ALLOWED_DIRS`（OS のパス区切り文字で複数指定）で変更できます。`..` とシンボリックリンクは解決したうえで判定し、範囲外は拒否します
- 入力は `.md` / `.markdown`、出力は `.html` / `.htm` のみ（シンボリックリンク先の拡張子も検査）
- Markdown 内の **生 HTML は無害化（テキストとしてエスケープ）** され、`<script>` やイベント属性は動作しません。`javascript:` / `data:`（画像の base64 以外）等のリンク・画像 URL は除去します。出力 HTML には `Content-Security-Policy`（スクリプト不可）も付与します
- ローカル画像は相対パスのまま参照されます。HTML を別の場所に保存すると画像が表示されない場合があります

## ローカル開発

```bash
git clone https://github.com/sinobure/earn-mcp-plugins.git
cd earn-mcp-plugins/markdown-to-pdf-mcp
npm install
npm run build     # dist/ を生成
npm test          # テスト
npm start         # サーバー起動（stdio モード）
```

## PDF 化の手順

1. `markdown_to_html` または `save_as_html_file` で HTML を生成
2. HTML ファイルをブラウザ（Chrome / Edge 推奨）で開く
3. `Ctrl+P`（macOS: `Cmd+P`）→ 送信先を「PDF に保存」→ 印刷

> Chrome / Edge を使うと、CSS の `@page` 設定が最も忠実に反映されます。

## ライセンス

MIT
