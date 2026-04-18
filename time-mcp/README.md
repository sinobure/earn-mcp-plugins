# kw-time-mcp

[![CI](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/Kento-Watarai/earn-mcp-plugins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kw-time-mcp.svg)](https://www.npmjs.com/package/kw-time-mcp)

AIアシスタント（Claude Desktop など）に現在時刻・タイムゾーン変換・日付計算・日本の祝日判定を提供する MCP サーバーです。

- **APIキー不要** — 完全ローカル動作
- **外部依存なし** — Node.js 組み込み `Intl` API のみ使用
- **祝日データ内蔵** — 2024〜2028年の日本の祝日をハードコード（オフライン対応）

## インストール

```bash
npm install -g kw-time-mcp
```

または `npx` で実行:

```bash
npx kw-time-mcp
```

## Claude Desktop への登録

`claude_desktop_config.json` に以下を追記してください。

```json
{
  "mcpServers": {
    "kw-time-mcp": {
      "command": "npx",
      "args": ["-y", "kw-time-mcp"]
    }
  }
}
```

グローバルインストール済みの場合:

```json
{
  "mcpServers": {
    "kw-time-mcp": {
      "command": "kw-time-mcp"
    }
  }
}
```

## 提供ツール

### 1. `get_current_time`

指定タイムゾーンの現在時刻を ISO 8601 形式で返します。省略時は `Asia/Tokyo`。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `timezone` | string | 任意 | IANA タイムゾーン名（例: `Asia/Tokyo`） |

**使用例:**

```
現在の東京時刻を教えてください
→ get_current_time()

ニューヨークの今の時間は？
→ get_current_time(timezone="America/New_York")
```

**レスポンス例:**

```json
{
  "datetime": "2026-04-17T15:30:00+09:00",
  "timezone": "Asia/Tokyo",
  "utc": "2026-04-17T06:30:00.000Z",
  "unix": 1776559800
}
```

---

### 2. `convert_timezone`

タイムゾーン間で日時を変換します。UTC オフセットがない場合は `from_tz` のローカル時刻として解釈します。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `datetime` | string | 必須 | ISO 8601 日時（例: `2024-01-01T09:00:00`） |
| `from_tz` | string | 必須 | 変換元タイムゾーン |
| `to_tz` | string | 必須 | 変換先タイムゾーン |

**使用例:**

```
2024-01-01T00:00:00Z を UTC から JST に変換して
→ convert_timezone("2024-01-01T00:00:00Z", "UTC", "Asia/Tokyo")
```

**レスポンス例:**

```json
{
  "input": "2024-01-01T00:00:00Z",
  "from_timezone": "UTC",
  "to_timezone": "Asia/Tokyo",
  "result": "2024-01-01T09:00:00+09:00",
  "utc": "2024-01-01T00:00:00.000Z"
}
```

---

### 3. `add_duration`

日時に期間を加算します。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `datetime` | string | 必須 | ISO 8601 日時 |
| `duration` | string | 必須 | 期間（例: `30s`, `15m`, `3h`, `1d`, `2w`） |

単位: `s`=秒 / `m`=分 / `h`=時間 / `d`=日 / `w`=週

**使用例:**

```
2024-01-01T00:00:00Z の 3時間後は？
→ add_duration("2024-01-01T00:00:00Z", "3h")

今から2週間後の日付を教えて
→ まず get_current_time() で現在時刻を取得してから add_duration(datetime, "2w")
```

**レスポンス例:**

```json
{
  "input": "2024-01-01T00:00:00Z",
  "duration": "3h",
  "result": "2024-01-01T03:00:00.000Z",
  "unix": 1704078000
}
```

---

### 4. `is_japanese_holiday`

YYYY-MM-DD 形式の日付が日本の祝日かどうかを判定し、祝日名を返します。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `date` | string | 必須 | 日付（`YYYY-MM-DD` 形式） |

**使用例:**

```
2026-05-03 は祝日ですか？
→ is_japanese_holiday("2026-05-03")
```

**レスポンス例:**

```json
{
  "date": "2026-05-03",
  "is_holiday": true,
  "holiday_name": "憲法記念日"
}
```

---

### 5. `list_japanese_holidays`

指定年の日本の祝日一覧を返します（2024〜2028年対応）。

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `year` | number | 必須 | 年（2024〜2028） |

**使用例:**

```
2026年の祝日を全部教えて
→ list_japanese_holidays(2026)
```

**レスポンス例:**

```json
{
  "year": 2026,
  "count": 16,
  "holidays": [
    { "date": "2026-01-01", "name": "元日" },
    { "date": "2026-01-12", "name": "成人の日" },
    ...
  ]
}
```

---

## 対応タイムゾーン

IANA タイムゾーンデータベースに準拠した任意のタイムゾーン名を使用できます。

| 表記例 | 地域 |
|---|---|
| `Asia/Tokyo` | 日本 (JST, +09:00) |
| `America/New_York` | 米国東部 (ET) |
| `America/Los_Angeles` | 米国西部 (PT) |
| `Europe/London` | 英国 (GMT/BST) |
| `Europe/Paris` | 中央ヨーロッパ (CET) |
| `UTC` | 協定世界時 |

## 動作環境

- Node.js 18 以上
- OS: Windows / macOS / Linux

## ライセンス

MIT License — Copyright (c) 2025 Kento Watarai
