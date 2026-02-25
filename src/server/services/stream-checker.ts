import { EventEmitter } from "events";
import { db, schema } from "@shared/db/index";
import { eq } from "drizzle-orm";
import { getStreams } from "../twitch/helix";
import { config } from "../config";

export interface StreamStatusChange {
  broadcasterId: string;
  login: string;
  isLive: boolean;
}

export class StreamChecker extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;

  async check(): Promise<StreamStatusChange[]> {
    const channels = db.select().from(schema.channels).all();
    if (channels.length === 0) return [];

    const userIds = channels.map((c) => c.broadcasterUserId);
    const liveStreams = await getStreams(userIds);
    const liveSet = new Set(liveStreams.map((s) => s.user_id));

    const changes: StreamStatusChange[] = [];
    const now = new Date().toISOString();

    for (const channel of channels) {
      const isLive = liveSet.has(channel.broadcasterUserId);
      const wasLive = channel.isLive;

      if (isLive !== wasLive) {
        changes.push({
          broadcasterId: channel.broadcasterUserId,
          login: channel.login,
          isLive,
        });
      }

      db.update(schema.channels)
        .set({ isLive, lastCheckedAt: now })
        .where(eq(schema.channels.id, channel.id))
        .run();
    }

    if (changes.length > 0) {
      console.log(
        `[stream-checker] Status changes: ${changes.map((c) => `${c.login}:${c.isLive ? "LIVE" : "offline"}`).join(", ")}`
      );
    }

    return changes;
  }

  start() {
    // Initial check
    this.check().then((changes) => {
      if (changes.length > 0) {
        this.emit("status_changed", changes);
      }
    });

    this.timer = setInterval(async () => {
      try {
        const changes = await this.check();
        if (changes.length > 0) {
          this.emit("status_changed", changes);
        }
      } catch (err) {
        console.error("[stream-checker] Error:", err);
      }
    }, config.streamCheckIntervalMs);

    console.log(
      `[stream-checker] Started. Interval: ${config.streamCheckIntervalMs / 1000}s`
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
