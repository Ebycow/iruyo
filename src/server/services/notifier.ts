import { WebSocketServer, WebSocket } from "ws";
import type { DetectedEvent, MessageFragment } from "./chat-ingest";
import type { StreamStatusChange } from "./stream-checker";
import { db, schema } from "@shared/db/index";
import { desc, eq } from "drizzle-orm";

export type NotifyEvent =
  | { type: "target_chatted"; data: DetectedEvent }
  | { type: "stream_status_changed"; data: StreamStatusChange }
  | { type: "initial_state"; data: InitialState };

interface InitialState {
  channels: Array<{
    broadcasterUserId: string;
    login: string;
    displayName: string;
    profileImageUrl: string | null;
    isLive: boolean;
  }>;
  watchTargets: Array<{
    userId: string;
    login: string;
    displayName: string;
    profileImageUrl: string | null;
    notifyDiscord: boolean;
  }>;
  recentEvents: Array<{
    channelBroadcasterId: string;
    chatterUserId: string;
    chatterLogin: string;
    chatterDisplayName?: string;
    messageText: string;
    messageFragments?: MessageFragment[] | null;
    detectedAt: string;
  }>;
}

function parseMessageFragments(
  value: string | null
): MessageFragment[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export class Notifier {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  start(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(
        `[notifier] Client connected. Total: ${this.clients.size}`
      );

      // Send initial state
      const state = this.getInitialState();
      ws.send(
        JSON.stringify({ type: "initial_state", data: state })
      );

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(
          `[notifier] Client disconnected. Total: ${this.clients.size}`
        );
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        } else {
          this.clients.delete(client);
        }
      }
    }, 30_000);

    console.log(`[notifier] WebSocket server started on port ${port}`);
  }

  private getInitialState(): InitialState {
    const channels = db
      .select({
        broadcasterUserId: schema.channels.broadcasterUserId,
        login: schema.channels.login,
        displayName: schema.channels.displayName,
        profileImageUrl: schema.channels.profileImageUrl,
        isLive: schema.channels.isLive,
      })
      .from(schema.channels)
      .all();

    const watchTargets = db
      .select({
        userId: schema.watchTargets.userId,
        login: schema.watchTargets.login,
        displayName: schema.watchTargets.displayName,
        profileImageUrl: schema.watchTargets.profileImageUrl,
        notifyDiscord: schema.watchTargets.notifyDiscord,
      })
      .from(schema.watchTargets)
      .all();

    const recentEvents = db
      .select({
        channelBroadcasterId: schema.events.channelBroadcasterId,
        chatterUserId: schema.events.chatterUserId,
        chatterLogin: schema.events.chatterLogin,
        chatterDisplayName: schema.watchTargets.displayName,
        messageText: schema.events.messageText,
        messageFragments: schema.events.messageFragments,
        detectedAt: schema.events.detectedAt,
      })
      .from(schema.events)
      .leftJoin(
        schema.watchTargets,
        eq(schema.watchTargets.userId, schema.events.chatterUserId)
      )
      .orderBy(desc(schema.events.detectedAt))
      .limit(30)
      .all()
      .map((event) => ({
        ...event,
        chatterDisplayName: event.chatterDisplayName ?? undefined,
        messageFragments: parseMessageFragments(event.messageFragments),
      }));

    return { channels, watchTargets, recentEvents };
  }

  broadcast(event: NotifyEvent) {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  notifyDetected(event: DetectedEvent) {
    this.broadcast({ type: "target_chatted", data: event });
  }

  notifyStreamStatus(change: StreamStatusChange) {
    this.broadcast({ type: "stream_status_changed", data: change });
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    for (const client of this.clients) {
      client.close();
    }
    this.wss?.close();
  }
}
