"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type WsMessage =
  | {
      type: "initial_state";
      data: {
        channels: Channel[];
        watchTargets: WatchTarget[];
        recentEvents: EventRecord[];
      };
    }
  | { type: "target_chatted"; data: EventRecord }
  | { type: "stream_status_changed"; data: StreamStatusChange };

export interface Channel {
  broadcasterUserId: string;
  login: string;
  displayName: string;
  profileImageUrl?: string | null;
  isLive: boolean;
}

export interface WatchTarget {
  userId: string;
  login: string;
  displayName: string;
  profileImageUrl?: string | null;
  notifyDiscord: boolean;
}

export interface MessageFragment {
  type: string;
  text: string;
  emoteId?: string;
}

export interface EventRecord {
  channelBroadcasterId: string;
  channelLogin?: string;
  chatterUserId: string;
  chatterLogin: string;
  chatterDisplayName?: string;
  messageText: string;
  messageFragments?: MessageFragment[] | null;
  messageId?: string;
  detectedAt: string;
}

export interface StreamStatusChange {
  broadcasterId: string;
  login: string;
  isLive: boolean;
}

const EVENT_FEED_LIMIT = 30;

export function useWebSocket(url: string, notificationsEnabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [watchTargets, setWatchTargets] = useState<WatchTarget[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [seenTargetsByChannel, setSeenTargetsByChannel] = useState<Record<string, string[]>>({});
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (e) => {
      const msg: WsMessage = JSON.parse(e.data);

      switch (msg.type) {
        case "initial_state":
          setChannels(msg.data.channels);
          setWatchTargets(msg.data.watchTargets);
          setEvents(msg.data.recentEvents.slice(0, EVENT_FEED_LIMIT));
          setSeenTargetsByChannel(() => {
            const liveSet = new Set(
              msg.data.channels.filter((c) => c.isLive).map((c) => c.broadcasterUserId)
            );
            const next: Record<string, string[]> = {};
            const seenByChannel = new Map<string, Set<string>>();
            for (const event of msg.data.recentEvents) {
              if (!liveSet.has(event.channelBroadcasterId)) continue;
              let seen = seenByChannel.get(event.channelBroadcasterId);
              if (!seen) {
                seen = new Set();
                seenByChannel.set(event.channelBroadcasterId, seen);
              }
              if (seen.has(event.chatterUserId)) continue;
              seen.add(event.chatterUserId);
              const list = next[event.channelBroadcasterId];
              if (list) {
                list.push(event.chatterUserId);
              } else {
                next[event.channelBroadcasterId] = [event.chatterUserId];
              }
            }
            return next;
          });
          break;

        case "target_chatted":
          setEvents((prev) =>
            [msg.data, ...prev].slice(0, EVENT_FEED_LIMIT)
          );
          setSeenTargetsByChannel((prev) => {
            const channelId = msg.data.channelBroadcasterId;
            const current = prev[channelId] || [];
            if (current.includes(msg.data.chatterUserId)) return prev;
            return {
              ...prev,
              [channelId]: [...current, msg.data.chatterUserId],
            };
          });

          // Browser notification
          if (notificationsEnabled && Notification.permission === "granted") {
            new Notification(
              `${msg.data.chatterLogin} が発言しました`,
              {
                body: `${msg.data.channelLogin}: ${msg.data.messageText}`,
                icon: "/favicon.ico",
              }
            );
          }
          break;

        case "stream_status_changed":
          setChannels((prev) =>
            prev.map((ch) =>
              ch.broadcasterUserId === msg.data.broadcasterId
                ? { ...ch, isLive: msg.data.isLive }
                : ch
            )
          );
          if (msg.data.isLive) {
            setSeenTargetsByChannel((prev) => ({
              ...prev,
              [msg.data.broadcasterId]: [],
            }));
          } else {
            setSeenTargetsByChannel((prev) => {
              if (!(msg.data.broadcasterId in prev)) return prev;
              const { [msg.data.broadcasterId]: _removed, ...rest } = prev;
              return rest;
            });
          }
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    connected,
    channels,
    watchTargets,
    setWatchTargets,
    events,
    seenTargetsByChannel,
  };
}
