import WebSocket from "ws";
import { EventEmitter } from "events";
import { getAccessToken, getClientId, ensureValidToken } from "./auth";
import type {
  EventSubMessage,
  EventSubNotification,
  ChatMessageEvent,
  CreateSubscriptionResponse,
} from "./types";
import { config } from "../config";

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const MAX_SUBS_PER_CONNECTION = 10;
const MAX_CONNECTIONS = 3;
const HELIX_BASE = "https://api.twitch.tv/helix";

// --- Single WebSocket Connection ---

interface ConnectionState {
  ws: WebSocket | null;
  sessionId: string | null;
  keepaliveTimeoutMs: number;
  keepaliveTimer: ReturnType<typeof setTimeout> | null;
  subscriptions: Set<string>; // broadcaster_user_ids subscribed on this connection
  subscriptionIds: Map<string, string>; // broadcaster_user_id -> subscription_id
  reconnectUrl: string | null;
  index: number;
}

class EventSubConnection extends EventEmitter {
  private state: ConnectionState;
  private reconnecting = false;
  private backoff = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<string> | null = null;

  constructor(index: number) {
    super();
    this.state = {
      ws: null,
      sessionId: null,
      keepaliveTimeoutMs: 15_000,
      keepaliveTimer: null,
      subscriptions: new Set(),
      subscriptionIds: new Map(),
      reconnectUrl: null,
      index,
    };
  }

  get sessionId() {
    return this.state.sessionId;
  }

  get index() {
    return this.state.index;
  }

  get subCount() {
    return this.state.subscriptions.size;
  }

  get isConnected() {
    return this.state.ws?.readyState === WebSocket.OPEN && this.state.sessionId;
  }

  hasSubscription(broadcasterId: string) {
    return this.state.subscriptions.has(broadcasterId);
  }

  getSubscriptionId(broadcasterId: string) {
    return this.state.subscriptionIds.get(broadcasterId);
  }

  connect(url?: string): Promise<string> {
    if (this.connectPromise) return this.connectPromise;
    this.clearReconnectTimer();

    const promise = new Promise<string>((resolve, reject) => {
      const wsUrl = url || EVENTSUB_WS_URL;
      console.log(`[eventsub-${this.state.index}] Connecting to ${wsUrl}`);

      const ws = new WebSocket(wsUrl);
      this.state.ws = ws;
      let settled = false;

      const resolveOnce = (sid: string) => {
        if (settled) return;
        settled = true;
        resolve(sid);
      };

      const rejectOnce = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const welcomeTimeout = setTimeout(() => {
        rejectOnce(new Error("Welcome timeout"));
        ws.close();
      }, 15_000);

      ws.on("open", () => {
        console.log(`[eventsub-${this.state.index}] WebSocket opened`);
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg: EventSubMessage = JSON.parse(data.toString());
          this.handleMessage(msg, resolveOnce, welcomeTimeout);
        } catch (err) {
          rejectOnce(err as Error);
          ws.close();
        }
      });

      ws.on("close", (code, reason) => {
        clearTimeout(welcomeTimeout);

        // Ignore stale sockets closed after a successful session handoff.
        if (ws !== this.state.ws) return;

        this.clearKeepaliveTimer();
        this.state.ws = null;
        this.state.sessionId = null;
        console.log(
          `[eventsub-${this.state.index}] Closed: ${code} ${reason?.toString()}`
        );

        if (!settled) {
          rejectOnce(new Error(`Connection closed before welcome (${code})`));
        }

        if (!this.reconnecting) {
          this.scheduleReconnect();
        }
      });

      ws.on("error", (err) => {
        console.error(`[eventsub-${this.state.index}] Error:`, err.message);
        if (ws !== this.state.ws) return;
        if (!settled) {
          rejectOnce(err);
        }
      });
    });

    this.connectPromise = promise.finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  private handleMessage(
    msg: EventSubMessage,
    resolveConnect?: (sid: string) => void,
    welcomeTimeout?: ReturnType<typeof setTimeout>
  ) {
    this.resetKeepaliveTimer();

    switch (msg.metadata.message_type) {
      case "session_welcome": {
        if (welcomeTimeout) clearTimeout(welcomeTimeout);
        const session = (msg as any).payload.session;
        this.state.sessionId = session.id;
        this.state.keepaliveTimeoutMs =
          (session.keepalive_timeout_seconds + 5) * 1000;
        this.backoff = 1000;
        console.log(
          `[eventsub-${this.state.index}] Welcome. Session: ${session.id}, Keepalive: ${session.keepalive_timeout_seconds}s`
        );
        if (resolveConnect) resolveConnect(session.id);
        this.emit("connected", session.id);
        break;
      }

      case "session_keepalive":
        break;

      case "session_reconnect": {
        const reconnectMsg = msg as any;
        const newUrl = reconnectMsg.payload.session.reconnect_url;
        console.log(
          `[eventsub-${this.state.index}] Reconnect requested → ${newUrl}`
        );
        this.handleReconnect(newUrl);
        break;
      }

      case "notification": {
        const notification = msg as EventSubNotification;
        this.emit("notification", notification.payload.event);
        break;
      }

      case "revocation": {
        const revocation = msg as any;
        const sub = revocation.payload.subscription;
        console.warn(
          `[eventsub-${this.state.index}] Revocation: ${sub.type} for ${sub.condition.broadcaster_user_id} (${sub.status})`
        );
        const broadcasterId = sub.condition.broadcaster_user_id;
        this.state.subscriptions.delete(broadcasterId);
        this.state.subscriptionIds.delete(broadcasterId);
        this.emit("revocation", broadcasterId);
        break;
      }
    }
  }

  private async handleReconnect(newUrl: string) {
    this.reconnecting = true;
    const oldWs = this.state.ws;

    try {
      await this.connect(newUrl);
      // New connection established, close old one
      oldWs?.close();
      console.log(
        `[eventsub-${this.state.index}] Reconnected. Subscriptions preserved.`
      );
    } catch (err) {
      console.error(
        `[eventsub-${this.state.index}] Reconnect failed:`,
        err
      );
      this.scheduleReconnect();
    } finally {
      this.reconnecting = false;
    }
  }

  private resetKeepaliveTimer() {
    this.clearKeepaliveTimer();
    this.state.keepaliveTimer = setTimeout(() => {
      console.warn(
        `[eventsub-${this.state.index}] Keepalive timeout, reconnecting...`
      );
      this.state.ws?.close();
    }, this.state.keepaliveTimeoutMs);
  }

  private clearKeepaliveTimer() {
    if (this.state.keepaliveTimer) {
      clearTimeout(this.state.keepaliveTimer);
      this.state.keepaliveTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log(
      `[eventsub-${this.state.index}] Reconnecting in ${this.backoff}ms...`
    );
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        // Re-subscribe to all channels
        this.emit("reconnected");
      } catch {
        this.backoff = Math.min(this.backoff * 2, 60_000);
        this.scheduleReconnect();
      }
    }, this.backoff);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  addSubscription(broadcasterId: string, subscriptionId: string) {
    this.state.subscriptions.add(broadcasterId);
    this.state.subscriptionIds.set(broadcasterId, subscriptionId);
  }

  removeSubscription(broadcasterId: string) {
    this.state.subscriptions.delete(broadcasterId);
    this.state.subscriptionIds.delete(broadcasterId);
  }

  getSubscriptionsSnapshot(): string[] {
    return [...this.state.subscriptions];
  }

  clearSubscriptions() {
    this.state.subscriptions.clear();
    this.state.subscriptionIds.clear();
  }

  close() {
    this.clearKeepaliveTimer();
    this.clearReconnectTimer();
    this.reconnecting = true; // prevent auto-reconnect
    this.state.ws?.close();
    this.state.ws = null;
    this.state.sessionId = null;
  }
}

// --- Manager: multiple connections ---

export class EventSubManager extends EventEmitter {
  private connections: EventSubConnection[] = [];
  private subscribeChain: Promise<any> = Promise.resolve();

  /** Serialized subscribe — prevents concurrent connection creation races */
  subscribe(broadcasterId: string): Promise<string | null> {
    const result = this.subscribeChain.then(() =>
      this._subscribe(broadcasterId)
    );
    // Keep the chain going even if one subscribe fails
    this.subscribeChain = result.catch(() => {});
    return result;
  }

  private async _subscribe(broadcasterId: string): Promise<string | null> {
    // Check if already subscribed
    for (const conn of this.connections) {
      if (conn.hasSubscription(broadcasterId)) {
        return conn.getSubscriptionId(broadcasterId) || null;
      }
    }

    // Prefer a connected connection with available slots.
    let conn = this.connections.find(
      (c) => c.isConnected && c.subCount < MAX_SUBS_PER_CONNECTION
    );

    // Do not create extra connections while an existing one is reconnecting.
    if (!conn) {
      conn = this.connections.find((c) => c.subCount < MAX_SUBS_PER_CONNECTION);
    }

    // Create a new connection only if no reusable connection exists.
    if (!conn && this.connections.length < MAX_CONNECTIONS) {
      conn = this.createConnection();
      await conn.connect();
    }

    if (!conn || !conn.sessionId) {
      console.error(
        `[eventsub-mgr] No available connection for ${broadcasterId}`
      );
      return null;
    }

    // Create subscription via Helix API
    try {
      const token = await ensureValidToken();
      const res = await fetch(`${HELIX_BASE}/eventsub/subscriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": getClientId(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: broadcasterId,
            user_id: config.twitch.botUserId,
          },
          transport: {
            method: "websocket",
            session_id: conn.sessionId,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          `[eventsub-mgr] Subscribe failed for ${broadcasterId}: ${res.status} ${text}`
        );
        return null;
      }

      const data: CreateSubscriptionResponse = await res.json();
      const sub = data.data[0];
      conn.addSubscription(broadcasterId, sub.id);
      console.log(
        `[eventsub-mgr] Subscribed to ${broadcasterId} on conn-${conn.index} (cost: ${data.total_cost}/${data.max_total_cost})`
      );
      return sub.id;
    } catch (err) {
      console.error(
        `[eventsub-mgr] Subscribe error for ${broadcasterId}:`,
        err
      );
      return null;
    }
  }

  async unsubscribe(broadcasterId: string): Promise<void> {
    for (const conn of this.connections) {
      const subId = conn.getSubscriptionId(broadcasterId);
      if (!subId) continue;

      try {
        const token = await ensureValidToken();
        const res = await fetch(
          `${HELIX_BASE}/eventsub/subscriptions?id=${subId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Client-Id": getClientId(),
            },
          }
        );

        if (res.ok || res.status === 404) {
          conn.removeSubscription(broadcasterId);
          console.log(
            `[eventsub-mgr] Unsubscribed from ${broadcasterId}`
          );
        } else {
          console.error(
            `[eventsub-mgr] Unsubscribe failed: ${res.status}`
          );
        }
      } catch (err) {
        console.error(`[eventsub-mgr] Unsubscribe error:`, err);
      }
      return;
    }
  }

  private createConnection() {
    const conn = new EventSubConnection(this.connections.length);
    conn.on("notification", (event: ChatMessageEvent) => {
      this.emit("chat_message", event);
    });
    conn.on("revocation", (revokedBroadcasterId: string) => {
      this.emit("revocation", revokedBroadcasterId);
    });
    conn.on("reconnected", () => {
      this.resubscribeAll(conn);
    });
    this.connections.push(conn);
    return conn;
  }

  private async resubscribeAll(conn: EventSubConnection) {
    const broadcasterIds = conn.getSubscriptionsSnapshot();
    conn.clearSubscriptions();

    for (const broadcasterId of broadcasterIds) {
      await this.subscribe(broadcasterId);
    }
  }

  getSubscribedChannels(): string[] {
    const channels: string[] = [];
    for (const conn of this.connections) {
      channels.push(...conn.getSubscriptionsSnapshot());
    }
    return channels;
  }

  close() {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections = [];
  }
}
