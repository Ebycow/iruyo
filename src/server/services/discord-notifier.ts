import { db, schema } from "@shared/db/index";
import { eq } from "drizzle-orm";
import type { DetectedEvent } from "./chat-ingest";

export class DiscordNotifier {
  constructor(private webhookUrl: string | undefined) {}

  async notifyDetected(event: DetectedEvent) {
    if (!this.webhookUrl) return;

    const channel = db
      .select({
        login: schema.channels.login,
        displayName: schema.channels.displayName,
      })
      .from(schema.channels)
      .where(eq(schema.channels.broadcasterUserId, event.channelBroadcasterId))
      .get();

    const channelName = channel?.displayName || event.channelLogin;
    const url = `https://twitch.tv/${event.channelLogin}`;
    const chatterName = event.chatterDisplayName || event.chatterLogin;

    const content = `${chatterName}が${channelName}にいるよ！${url}`;

    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          `[discord-notifier] Webhook failed: ${res.status} ${text}`
        );
      }
    } catch (err) {
      console.error("[discord-notifier] Webhook error:", err);
    }
  }
}
