import { EventEmitter } from "events";
import { db, schema } from "@shared/db/index";
import { eq } from "drizzle-orm";
import { EventSubManager } from "../twitch/eventsub";
import type { ChatMessageEvent, ChatMessageFragment } from "../twitch/types";
import type { StreamStatusChange } from "./stream-checker";

export interface MessageFragment {
  type: string;
  text: string;
  emoteId?: string;
}

export interface DetectedEvent {
  channelBroadcasterId: string;
  channelLogin: string;
  chatterUserId: string;
  chatterLogin: string;
  chatterDisplayName: string;
  messageText: string;
  messageFragments?: MessageFragment[] | null;
  messageId: string;
  detectedAt: string;
}

function normalizeMessageFragments(
  fragments?: ChatMessageFragment[]
): MessageFragment[] | null {
  if (!fragments || fragments.length === 0) return null;
  const normalized = fragments.map((fragment) => ({
    type: fragment.type,
    text: fragment.text ?? "",
    emoteId: fragment.emote?.id,
  }));
  return normalized.length > 0 ? normalized : null;
}

function serializeMessageFragments(
  fragments: MessageFragment[] | null
): string | null {
  if (!fragments || fragments.length === 0) return null;
  try {
    return JSON.stringify(fragments);
  } catch (err) {
    console.warn("[chat-ingest] Failed to serialize message fragments:", err);
    return null;
  }
}

export class ChatIngest extends EventEmitter {
  private eventSubManager: EventSubManager;
  private watchTargetIds: Set<string> = new Set();
  private discordNotifyTargetIds: Set<string> = new Set();
  private seenInStreamByChannel: Map<string, Set<string>> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.eventSubManager = new EventSubManager();

    this.eventSubManager.on("chat_message", (event: ChatMessageEvent) => {
      this.handleChatMessage(event);
    });

    this.eventSubManager.on("revocation", (broadcasterId: string) => {
      console.warn(
        `[chat-ingest] Subscription revoked for ${broadcasterId}`
      );
    });
  }

  refreshWatchTargets() {
    const targets = db.select().from(schema.watchTargets).all();
    this.watchTargetIds = new Set(targets.map((t) => t.userId));
    this.discordNotifyTargetIds = new Set(
      targets.filter((t) => t.notifyDiscord).map((t) => t.userId)
    );
    console.log(
      `[chat-ingest] Watch targets refreshed: ${this.watchTargetIds.size} users`
    );
  }

  /** Periodically re-read watch_targets from DB so that additions/deletions via the web UI take effect. */
  startWatchTargetSync(intervalMs = 10_000) {
    this.refreshTimer = setInterval(() => {
      this.refreshWatchTargets();
    }, intervalMs);
  }

  stopWatchTargetSync() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private handleChatMessage(event: ChatMessageEvent) {
    if (!this.watchTargetIds.has(event.chatter_user_id)) return;

    // Target user detected!
    const now = new Date().toISOString();
    const messageFragments = normalizeMessageFragments(
      event.message?.fragments
    );
    const messageFragmentsJson = serializeMessageFragments(messageFragments);

    // Save to DB (ignore duplicates via unique message_id)
    try {
      db.insert(schema.events)
        .values({
          channelBroadcasterId: event.broadcaster_user_id,
          chatterUserId: event.chatter_user_id,
          chatterLogin: event.chatter_user_login,
          messageText: event.message.text,
          messageFragments: messageFragmentsJson,
          messageId: event.message_id,
          detectedAt: now,
        })
        .run();
    } catch (err: any) {
      if (err?.code === "SQLITE_CONSTRAINT_UNIQUE") return; // duplicate
      console.error("[chat-ingest] DB insert error:", err);
      return;
    }

    const detected: DetectedEvent = {
      channelBroadcasterId: event.broadcaster_user_id,
      channelLogin: event.broadcaster_user_login,
      chatterUserId: event.chatter_user_id,
      chatterLogin: event.chatter_user_login,
      chatterDisplayName: event.chatter_user_name,
      messageText: event.message.text,
      messageFragments,
      messageId: event.message_id,
      detectedAt: now,
    };

    console.log(
      `[chat-ingest] DETECTED: ${detected.chatterLogin} in ${detected.channelLogin}: "${detected.messageText}"`
    );

    this.emit("detected", detected);

    const isFirstInStream = this.markSeenInStream(
      event.broadcaster_user_id,
      event.chatter_user_id
    );
    if (
      isFirstInStream &&
      this.discordNotifyTargetIds.has(event.chatter_user_id)
    ) {
      this.emit("discord_notify", detected);
    }
  }

  private markSeenInStream(
    channelBroadcasterId: string,
    chatterUserId: string
  ): boolean {
    let seenSet = this.seenInStreamByChannel.get(channelBroadcasterId);
    if (!seenSet) {
      seenSet = new Set();
      this.seenInStreamByChannel.set(channelBroadcasterId, seenSet);
    }
    if (seenSet.has(chatterUserId)) return false;
    seenSet.add(chatterUserId);
    return true;
  }

  async onStreamStatusChanged(change: StreamStatusChange) {
    if (change.isLive) {
      console.log(
        `[chat-ingest] ${change.login} went LIVE, subscribing...`
      );
      await this.eventSubManager.subscribe(change.broadcasterId);
      this.seenInStreamByChannel.set(change.broadcasterId, new Set());
    } else {
      console.log(
        `[chat-ingest] ${change.login} went offline, unsubscribing...`
      );
      await this.eventSubManager.unsubscribe(change.broadcasterId);
      this.seenInStreamByChannel.delete(change.broadcasterId);
    }
  }

  async subscribeToLiveChannels() {
    const liveChannels = db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.isLive, true))
      .all();

    console.log(
      `[chat-ingest] Subscribing to ${liveChannels.length} live channels...`
    );

    for (const channel of liveChannels) {
      await this.eventSubManager.subscribe(channel.broadcasterUserId);
      this.seenInStreamByChannel.set(channel.broadcasterUserId, new Set());
    }
  }

  getSubscribedChannels(): string[] {
    return this.eventSubManager.getSubscribedChannels();
  }

  close() {
    this.stopWatchTargetSync();
    this.eventSubManager.close();
  }
}
