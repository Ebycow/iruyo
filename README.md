# twitch-ni-iruyo

Twitchの指定チャンネルを監視し、**ウォッチリストに登録したユーザーがチャットに書き込んだ瞬間**をリアルタイムで通知するツールです。

## 機能

- **チャンネル監視**: CSVファイルで指定したTwitchチャンネルの配信状況を定期確認（60秒間隔）
- **ユーザー検知**: ウォッチリストに登録したユーザーがライブチャットに発言したことを即座に検知
- **リアルタイム通知**: WebSocket経由でダッシュボードにリアルタイム表示 + ブラウザプッシュ通知
- **Discord通知（リスナー検知）**: Discordウェブフックで通知（配信ごとに初回発言のみ）
- **Discord通知（配信開始/終了）**: 指定した配信者の配信開始・終了を別ウェブフックで通知（タイトル・ゲーム・タグ・配信時間・アーカイブURLを含む）
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
| `DISCORD_LISTNER_NOTIFY_WEBHOOK_URL` | **リスナー検知通知**用のDiscordウェブフックURL（省略可） |
| `DISCORD_BROADCASTER_NOTIFY_WEBHOOK_URL` | **配信開始/終了通知**用のDiscordウェブフックURL（省略可） |
| `DISCORD_BROADCASTER_NOTIFY_WEBHOOK_USER_ID` | 配信開始/終了を通知する配信者のTwitchユーザーID（カンマ区切りで複数指定可） |
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
4. 必要に応じてDiscord通知をユーザーごとにON/OFFできる（`DISCORD_LISTNER_NOTIFY_WEBHOOK_URL` 設定時）

## Discord通知

### リスナー検知通知（`DISCORD_LISTNER_NOTIFY_WEBHOOK_URL`）

ウォッチリストに登録したユーザーが監視チャンネルのライブチャットに初めて発言したとき、指定のDiscordウェブフックに通知します。通知はウォッチリストのユーザーごとにON/OFFで切り替えられます。

### 配信開始/終了通知（`DISCORD_BROADCASTER_NOTIFY_WEBHOOK_URL`）

`DISCORD_BROADCASTER_NOTIFY_WEBHOOK_USER_ID` に指定した配信者の配信開始・終了を通知します。

**配信開始通知の内容:**
- 配信タイトル・ゲーム名・タグ
- 配信開始時点の視聴者数
- チャンネルURL

**配信終了通知の内容:**
- 配信タイトル・配信時間
- アーカイブ動画URL（VOD公開まで約2分待ってから取得）

**コールドスタート抑制:** アプリ再起動時、すでに配信中だった配信者には配信開始通知を送らず、配信終了から通知を再開します。これにより再起動のたびに通知が飛ぶことを防ぎます。

## 開発

```bash
# 依存パッケージをインストール
npm install

# DBマイグレーション
npm run db:migrate

# 開発サーバー起動（サーバー + Next.js を同時起動）
npm run dev
```
