import { getRecentVods } from "../twitch/helix";
import type { TwitchVideo } from "../twitch/types";
import type { StreamStatusChange } from "./stream-checker";

const VOD_FETCH_DELAY_MS = 2 * 60 * 1000; // 2分: VOD生成を待つ

interface LiveStreamCache {
  streamId?: string;
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

/**
 * 配信開始から終了検知までに作られたVODを古い順に返す。
 * 配信を素早く切り替えるとポーリングではオフラインを検知できず、1回の配信に複数のVODができる。
 */
function selectSessionVods(
  vods: TwitchVideo[],
  cached: LiveStreamCache,
  endedAt: Date
): TwitchVideo[] {
  const startMs = new Date(cached.startedAt).getTime();
  const endMs = endedAt.getTime();

  return vods
    .filter((vod) => {
      const createdMs = new Date(vod.created_at).getTime();
      return (
        vod.stream_id === cached.streamId ||
        (createdMs >= startMs && createdMs <= endMs)
      );
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function formatVodLines(vods: TwitchVideo[]): string[] {
  if (vods.length === 0) {
    return ["アーカイブ動画：提供されていません"];
  }
  if (vods.length === 1) {
    return [`アーカイブ動画：${vods[0].url}`];
  }
  return ["アーカイブ動画：", ...vods.flatMap((vod) => [`・${vod.title}`, vod.url])];
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
    coldStartIds: Set<string>,
    private nicknames: Map<string, string> = new Map()
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

  /** 設定されたニックネームがあればそれを、なければTwitchの表示名を返す */
  private resolveName(broadcasterId: string, fallback: string): string {
    return this.nicknames.get(broadcasterId) ?? fallback;
  }

  async onStreamStatusChanged(change: StreamStatusChange): Promise<void> {
    if (!this.webhookUrl) return;
    if (!this.notifyUserIds.has(change.broadcasterId)) return;

    if (change.isLive) {
      const stream = change.streamData;
      this.liveCache.set(change.broadcasterId, {
        streamId: stream?.id,
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

    const displayName = this.resolveName(broadcasterId, stream.user_name);
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

    const displayName = this.resolveName(broadcasterId, cached.displayName);
    const now = toJST(endedAt);
    const duration = formatDuration(cached.startedAt, endedAt);

    let vods: TwitchVideo[] = [];
    try {
      console.log(`[broadcaster-notifier] Fetching recent VODs for ${cached.login} (${broadcasterId})...`);
      vods = selectSessionVods(await getRecentVods(broadcasterId), cached, endedAt);
      if (vods.length > 0) {
        console.log(
          `[broadcaster-notifier] VODs found: ${vods.map((vod) => `${vod.url} (duration: ${vod.duration})`).join(", ")}`
        );
      } else {
        console.log(`[broadcaster-notifier] No VOD found for ${cached.login}`);
      }
    } catch (err) {
      console.error("[broadcaster-notifier] Failed to fetch VOD:", err);
    }

    // VODが複数あるときは各VODのタイトルを載せるので、配信開始時のタイトルは省く
    const lines = [
      `**${displayName}の配信が終わりました**`,
      "",
      `日時：${now}`,
      `配信時間：${duration}`,
      vods.length > 1 ? null : `タイトル：${cached.title}`,
      "",
      ...formatVodLines(vods),
    ]
      .filter((l) => l !== null)
      .join("\n");

    console.log(
      `[broadcaster-notifier] Sending end notification for ${cached.login} (duration: ${duration})`
    );
    const ok = await postWebhook(this.webhookUrl, lines);
    if (ok) {
      console.log(`[broadcaster-notifier] End notification sent for ${cached.login}`);
    }
  }
}
