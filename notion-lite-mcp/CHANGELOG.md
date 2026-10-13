# Changelog

## 1.1.0 (2026-10-13)
- Added `create_page`, `query_database` (with `filter` / `sorts`), `list_children`.
- `get_page` expands nested blocks and shows page properties.
- `append_to_page` converts light Markdown (headings, lists, to-dos, quotes, dividers, code fences), splits long lines and sends 100-block batches.
- Read tools retry up to 2 times on HTTP 429; writes never auto-retry.
- Server starts without `NOTION_API_KEY` and returns setup instructions from tool calls.
