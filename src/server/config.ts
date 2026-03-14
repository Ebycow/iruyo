import "dotenv/config";

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
  discordBroadcasterNotifyUserIds: (process.env.DISCORD_BROADCASTER_NOTIFY_WEBHOOK_USER_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
