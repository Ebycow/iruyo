import { getLatestVod } from "../twitch/helix";
import type { StreamStatusChange } from "./stream-checker";

const VOD_FETCH_DELAY_MS = 2 * 60 * 1000; // 2分: VOD生成を待つ

interface LiveStreamCache {
  displayName: string;
  login: string;
  title: string;
  gameName: string;
  startedAt: string;
  viewerCount: number;
}

function toJST(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }) + " JST";
}

function formatDuration(startedAt: string, endedAt: Date): string {
  const startMs = new Date(startedAt).getTime();
  const totalSeconds = Math.floor((endedAt.getTime() - startMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}

async function postWebhook(webhookUrl: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[broadcaster-notifier] Webhook failed: ${res.status} ${text}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[broadcaster-notifier] Webhook error:", err);
    return false;
  }
}

export class BroadcasterNotifier {
  private liveCache: Map<string, LiveStreamCache> = new Map();
  private coldStartIds: Set<string>;

  constructor(
    private webhookUrl: string | undefined,
    private notifyUserIds: Set<string>,
    coldStartIds: Set<string>
  ) {
    this.coldStartIds = new Set(coldStartIds);
    if (!webhookUrl) {
      console.warn(
        "[broadcaster-notifier] DISCORD_BROADCASTER_NOTIFY_WEBHOOK_URL is not set — notifications disabled"
      );
    } else {
      console.log(
        `[broadcaster-notifier] Initialized. Notify targets: [${[...notifyUserIds].join(", ")}]`
      );
    }
  }

  async onStreamStatusChanged(change: StreamStatusChange): Promise<void> {
    if (!this.webhookUrl) return;
    if (!this.notifyUserIds.has(change.broadcasterId)) return;

    if (change.isLive) {
      const stream = change.streamData;
      this.liveCache.set(change.broadcasterId, {
        displayName: stream?.user_name ?? change.login,
        login: stream?.user_login ?? change.login,
        title: stream?.title ?? "",
        gameName: stream?.game_name ?? "",
        startedAt: stream?.started_at ?? new Date().toISOString(),
        viewerCount: stream?.viewer_count ?? 0,
      });

      if (this.coldStartIds.has(change.broadcasterId)) {
        console.log(
          `[broadcaster-notifier] Cold start: skipping start notification for ${change.login}`
        );
        this.coldStartIds.delete(change.broadcasterId);
        return;
      }

      await this.sendStartNotification(change.broadcasterId, stream);
    } else {
      const cached = this.liveCache.get(change.broadcasterId);
      this.liveCache.delete(change.broadcasterId);

      if (cached) {
        const endedAt = new Date();
        const delayMin = VOD_FETCH_DELAY_MS / 60000;
        console.log(
          `[broadcaster-notifier] ${change.login} went offline. End notification scheduled in ${delayMin} min (waiting for VOD).`
        );
        setTimeout(async () => {
          await this.sendEndNotification(change.broadcasterId, cached, endedAt);
        }, VOD_FETCH_DELAY_MS);
      } else {
        console.log(
          `[broadcaster-notifier] ${change.login} went offline but no stream cache found (cold-start stream). Skipping end notification.`
        );
      }
    }
  }

  private async sendStartNotification(
    broadcasterId: string,
    stream: import("../twitch/types").TwitchStream | undefined
  ): Promise<void> {
    if (!this.webhookUrl || !stream) {
      if (!stream) {
        console.warn(
          `[broadcaster-notifier] Start notification skipped for ${broadcasterId}: no streamData attached`
        );
      }
      return;
    }

    const displayName = stream.user_name;
    const now = toJST(new Date());
    const game = stream.game_name || "—";
    const tags =
      stream.tags && stream.tags.length > 0
        ? stream.tags.join(" / ")
        : null;
    const channelUrl = `https://twitch.tv/${stream.user_login}`;

    const lines = [
      `**${displayName}の配信が始まりました**`,
      "",
      `日時：${now}`,
      `タイトル：${stream.title}`,
      `ゲーム：${game}`,
      tags ? `タグ：${tags}` : null,
      `視聴者数：${stream.viewer_count.toLocaleString()}人`,
      `チャンネルURL：${channelUrl}`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    console.log(
      `[broadcaster-notifier] Sending start notification for ${stream.user_login} (title: "${stream.title}", game: "${game}")`
    );
    const ok = await postWebhook(this.webhookUrl, lines);
    if (ok) {
      console.log(`[broadcaster-notifier] Start notification sent for ${stream.user_login}`);
    }
  }

  private async sendEndNotification(
    broadcasterId: string,
    cached: LiveStreamCache,
    endedAt: Date
  ): Promise<void> {
    if (!this.webhookUrl) return;

    const now = toJST(endedAt);
    const duration = formatDuration(cached.startedAt, endedAt);

    let vodLine: string;
    try {
      console.log(`[broadcaster-notifier] Fetching latest VOD for ${cached.login} (${broadcasterId})...`);
      const vod = await getLatestVod(broadcasterId);
      if (vod) {
        console.log(`[broadcaster-notifier] VOD found: ${vod.url} (duration: ${vod.duration})`);
        vodLine = `アーカイブ動画：${vod.url}`;
      } else {
        console.log(`[broadcaster-notifier] No VOD found for ${cached.login}`);
        vodLine = "アーカイブ動画：提供されていません";
      }
    } catch (err) {
      console.error("[broadcaster-notifier] Failed to fetch VOD:", err);
      vodLine = "アーカイブ動画：提供されていません";
    }

    const lines = [
      `**${cached.displayName}の配信が終わりました**`,
      "",
      `日時：${now}`,
      `配信時間：${duration}`,
      `タイトル：${cached.title}`,
      "",
      vodLine,
    ].join("\n");

    console.log(
      `[broadcaster-notifier] Sending end notification for ${cached.login} (duration: ${duration})`
    );
    const ok = await postWebhook(this.webhookUrl, lines);
    if (ok) {
      console.log(`[broadcaster-notifier] End notification sent for ${cached.login}`);
    }
  }
}
