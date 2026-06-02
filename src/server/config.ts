import "dotenv/config";

const broadcasterNotifyUserIds = (process.env.DISCORD_BROADCASTER_NOTIFY_WEBHOOK_USER_ID || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// USER_ID と同じ配列位置のニックネームでDiscord通知の名前を上書きする。
// 空欄の位置はTwitchの表示名をそのまま使う。
const broadcasterNotifyNicknameList = (process.env.DISCORD_BROADCASTER_NOTIFY_WEBHOOK_NICKNAME || "")
  .split(",")
  .map((s) => s.trim());

const broadcasterNotifyNicknames = new Map<string, string>();
broadcasterNotifyUserIds.forEach((userId, i) => {
  const nickname = broadcasterNotifyNicknameList[i];
  if (nickname) {
    broadcasterNotifyNicknames.set(userId, nickname);
  }
});

export const config = {
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || "",
    clientSecret: process.env.TWITCH_CLIENT_SECRET || "",
    botAccessToken: process.env.TWITCH_BOT_ACCESS_TOKEN || "",
    botRefreshToken: process.env.TWITCH_BOT_REFRESH_TOKEN || "",
    botUserId: process.env.TWITCH_BOT_USER_ID || "",
  },
  csvPath:
    process.env.CSV_PATH || "",
  csvSyncIntervalMs: 5 * 60 * 1000, // 5 minutes
  streamCheckIntervalMs: 60 * 1000, // 60 seconds
  wsNotifyPort: 3001,
  discordListenerNotifyWebhookUrl: process.env.DISCORD_LISTNER_NOTIFY_WEBHOOK_URL,
  discordBroadcasterNotifyWebhookUrl: process.env.DISCORD_BROADCASTER_NOTIFY_WEBHOOK_URL,
  discordBroadcasterNotifyUserIds: broadcasterNotifyUserIds,
  discordBroadcasterNotifyNicknames: broadcasterNotifyNicknames,
};
