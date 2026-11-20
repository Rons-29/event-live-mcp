# event-live-mcp

勉強会の X（旧 Twitter）ハッシュタグ実況を、**ローカル stdio MCP サーバー**経由で取得・登壇枠へ振り分け・HTML 化するツールです。要約はサーバー側では行わず、呼び出し側の AI（Claude Code / Cursor）が行います。

## できること（v1）

| ツール | 役割 |
|--------|------|
| `fetch_posts` | ハッシュタグ + 開始時刻で **未取得の投稿だけ** を X API v2 Recent Search から取得。`since_id` カーソル・投稿 ID・編集履歴で永続デデュープ。RT 除外 |
| `group_posts` | 呼び出し側が渡すタイムテーブル（登壇者・題名・開始/終了・任意の資料 URL）で投稿を枠に割当。枠外は `unassigned`。スライド系 URL を抽出 |
| `render_html` | 枠ごとの **要点（呼び出し側が渡す）**・資料/スライドリンク・元投稿リンク入りの簡易 HTML を書き出し |

対象外: リモート HTTP サーバー、ログイン、課金、掲示板、サーバー側の定期ポーリング。

## 必要要件

- Node.js 20+
- X API v2 の Bearer Token（環境変数 `X_BEARER_TOKEN` のみ。ツール引数・設定ファイル・ログ・HTML・state には載せない）

## セットアップ

```bash
git clone https://github.com/Rons-29/event-live-mcp.git
cd event-live-mcp
npm install
npm run build
```

```bash
export X_BEARER_TOKEN="あなたのBearerトークン"
```

`.env` に書く場合は自分のシェル／ランチャーで読み込んでください（リポジトリにはコミットしないでください）。見本は `.env.example` です。

## MCP 設定（Claude Code / Cursor 共通の動き）

どちらから呼んでも、同じ `X_BEARER_TOKEN`・同じ作業ディレクトリなら **同じ HTML** が生成されます。

### Claude Code

CLI で追加する例:

```bash
claude mcp add event-live --env X_BEARER_TOKEN=$X_BEARER_TOKEN -- node /絶対パス/event-live-mcp/dist/index.js
```

プロジェクトの `.mcp.json` 例:

```json
{
  "mcpServers": {
    "event-live": {
      "command": "node",
      "args": ["/絶対パス/event-live-mcp/dist/index.js"],
      "env": {
        "X_BEARER_TOKEN": "${X_BEARER_TOKEN}"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json`（または Cursor の MCP 設定）例:

```json
{
  "mcpServers": {
    "event-live": {
      "command": "node",
      "args": ["/絶対パス/event-live-mcp/dist/index.js"],
      "env": {
        "X_BEARER_TOKEN": "${X_BEARER_TOKEN}"
      }
    }
  }
}
```

`npm run build` 後の `dist/index.js` を指してください。開発中は `npx tsx src/index.ts` でも可です。

## 典型的な呼び出し順

1. **`fetch_posts`** — `event_id` / `hashtag` / `start_time`（初回のみ下限。以降は自動で `since_id`）
2. **`group_posts`** — タイムテーブル JSON を渡す
3. 呼び出し側 AI が各枠の投稿を読んで **要点リストを作成**
4. **`render_html`** — `summaries` に要点を渡して HTML 出力

状態は `.data/<event_dir>/state.json`（投稿 + カーソル）、グルーピングは `.data/<event_dir>/grouping.json`、HTML 既定は `output/<event_id>.html` です。いずれも `.gitignore` 済みです。

- `event_id` は `[A-Za-z0-9._-]` 推奨。それ以外（日本語・`/` など）は衝突しないよう base64url ディレクトリ名にエンコードします。
- 同じ `event_id` に別ハッシュタグを紐づけることはできません（別 `event_id` を使ってください）。
- `fetch_posts` はイベント単位のファイルロックで、並行呼び出し（Claude Code と Cursor 同時など）でも state を潰しません。

### デデュープ / 取得ルール

- **投稿 ID**: 一度保存した ID は再保存しない。
- **編集投稿**: X API の `edit_history_tweet_ids` で同一チェーンとみなす。編集前・編集後が別 ID で返っても **1 投稿** として数え、**最新版だけ** を保持する（同一 fetch 内でも、前回 fetch の原文 → 次回 fetch の編集版でも同じ）。
- **RT**: クエリに `-is:retweet` を付け、さらに `referenced_tweets.type === retweeted`（および `RT @` フォールバック）で除外。引用ポストは対象外（残す）。
- **カーソル**: 取得済みの最大 snowflake ID を `since_id` として永続化（編集履歴上の古い ID もカーソル計算に含める）。

### タイムテーブル例

```json
[
  {
    "id": "talk-a",
    "speaker": "Alice Example",
    "title": "Talk A",
    "startTime": "2026-11-20T10:00:00+09:00",
    "endTime": "2026-11-20T10:30:00+09:00"
  },
  {
    "id": "talk-b",
    "speaker": "Bob Example",
    "title": "Talk B",
    "startTime": "2026-11-20T10:30:00+09:00",
    "endTime": "2026-11-20T11:30:00+09:00",
    "materialsUrl": "https://speakerdeck.com/bob_fixture/talk-b-official"
  }
]
```

- 開始は inclusive、終了は exclusive。
- `materialsUrl` は任意。呼び出し側が知っている公式資料 / スライド URL を渡す（この版では公式ページのスクレイピングはしない）。HTML では投稿から抽出した URL とマージし、同一 URL は 1 回だけ出す（資料由来を優先表示）。

## テスト

ネットワークも実トークンも不要です（X クライアントはモック）。

```bash
npm test
```

カバー範囲: 反復 fetch のデデュープ / `since_id`、編集履歴の同一 fetch・横断 fetch、RT 除外、`materialsUrl` の HTML マージ、タイムテーブル境界と `unassigned`、スライド URL 抽出、同一入力での HTML バイト一致、トークンのログ漏れ防止。

## 開発

```bash
npm run typecheck
npm run build
npm start   # stdio MCP（通常はホストから起動）
```

## セキュリティメモ

- Bearer トークンは **環境変数のみ**。コード・コミット・ツール出力・HTML・state に含めない。
- 公開リポジトリのため、実在の投稿本文・実ハンドル・実イベント固有の個人情報はサンプルに使わないこと。

## ライセンス

MIT

## 参考文献

- [Model Context Protocol — TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [X API: Search recent posts](https://docs.x.com/x-api/posts/search/api-reference/get-tweets-search-recent)（Recent Search / `since_id` / `start_time`）
- [How to analyze edited Tweets with the Twitter API v2](https://dev.to/suhemparack/how-to-analyze-edited-tweets-with-the-twitter-api-v2-using-python-odj)（`edit_history_tweet_ids` / `edit_controls`）
- [Claude Code — MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Cursor — Model Context Protocol](https://docs.cursor.com/context/model-context-protocol)
