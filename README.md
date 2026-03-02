# twitch-ni-iruyo

Twitchの指定チャンネルを監視し、**ウォッチリストに登録したユーザーがチャットに書き込んだ瞬間**をリアルタイムで通知するツールです。

## 機能

- **チャンネル監視**: CSVファイルで指定したTwitchチャンネルの配信状況を定期確認（60秒間隔）
- **ユーザー検知**: ウォッチリストに登録したユーザーがライブチャットに発言したことを即座に検知
- **リアルタイム通知**: WebSocket経由でダッシュボードにリアルタイム表示 + ブラウザプッシュ通知
- **Discord通知**: Discordウェブフックで通知（配信ごとに初回発言のみ）
- **Webダッシュボード**: チャンネル一覧・イベントフィード・ウォッチリストを3カラムで表示

## 技術スタック

| 領域 | 使用技術 |
|------|----------|
| フロントエンド | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| バックエンド | Node.js (tsx), WebSocket (ws) |
| DB | SQLite (better-sqlite3 + Drizzle ORM) |
| 外部API | Twitch EventSub API, Helix API |
| デプロイ | Docker / Docker Compose |

## セットアップ

### 前提条件

- [Twitch Developer Console](https://dev.twitch.tv/console) でアプリケーションを作成済みであること
- チャット読み取り権限（`user:read:chat`）を持つBotアカウントのアクセストークンを取得済みであること
- Docker & Docker Compose がインストール済みであること

### 1. Twitch アクセストークンの取得

`user:read:chat` スコープを持つBotアカウントの `ACCESS_TOKEN` と `REFRESH_TOKEN` が必要です。取得方法はいくつかありますが、[Twitch CLI](https://dev.twitch.tv/docs/cli/) を使うと手軽です。

**認証情報を設定**（クライアントIDとシークレットはDeveloper Consoleで確認）:

```bash
twitch configure -i <CLIENT_ID> -s <CLIENT_SECRET>
```

**Botアカウントのトークンを取得**:

```bash
twitch token -u -s "user:read:chat"
```

実行するとブラウザが開くので、**Botアカウント**でログインして認可します。完了すると `ACCESS_TOKEN` と `REFRESH_TOKEN` がターミナルに表示されます。これらを後述の環境変数に設定します。

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、各値を設定します。

```bash
cp .env.example .env
```

| 変数名 | 説明 |
|--------|------|
| `TWITCH_CLIENT_ID` | TwitchアプリのクライアントID |
| `TWITCH_CLIENT_SECRET` | Twitchアプリのクライアントシークレット |
| `TWITCH_BOT_ACCESS_TOKEN` | BotアカウントのOAuthアクセストークン |
| `TWITCH_BOT_REFRESH_TOKEN` | BotアカウントのOAuthリフレッシュトークン |
| `TWITCH_BOT_USER_ID` | BotアカウントのTwitchユーザーID |
| `DISCORD_WEBHOOK_URL` | Discord通知先のウェブフックURL（省略可） |
| `CSV_PATH` | 監視対象チャンネルCSVのパス |
| `DATABASE_PATH` | SQLiteデータベースのパス（例: `./data/iruyo.db`） |

CSV_PATHは https://github.com/Ebycow/twicome と互換性があります

### 3. 監視対象チャンネルCSVの準備

以下の形式でCSVファイルを作成します。

```csv
login,id
streamer_a,123456789
streamer_b,987654321
```

- `login`: Twitchのログイン名
- `id`: TwitchブロードキャスターユーザーID

CSVは起動後も5分間隔で自動再読み込みされます。追加したチャンネルはアプリ再起動なしで反映されます。

### 4. 起動（Docker Compose）

```bash
docker compose up -d
```

起動後、`http://localhost:3000` でダッシュボードにアクセスできます。

| ポート | 用途 |
|--------|------|
| 3000 | Next.js Webダッシュボード |
| 3001 | WebSocket通知サーバー |

## 使い方

1. ダッシュボード右のウォッチリストパネルからユーザー名を検索して追加
2. 左のチャンネル一覧に監視対象チャンネルが表示され、配信中は「LIVE」バッジが付く
3. ウォッチリストのユーザーがライブチャンネルで発言すると中央のイベントフィードに表示される
4. 必要に応じてDiscord通知をユーザーごとにON/OFFできる（Discordウェブフック設定時）

## 開発

```bash
# 依存パッケージをインストール
npm install

# DBマイグレーション
npm run db:migrate

# 開発サーバー起動（サーバー + Next.js を同時起動）
npm run dev
```
