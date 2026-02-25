"use client";

import type { EventRecord, Channel, WatchTarget } from "@/hooks/use-websocket";
import { useMinuteNow } from "@/hooks/use-minute-now";
import { timeAgo } from "@/lib/utils";
import { ChatMessage } from "./chat-message";

interface Props {
  events: EventRecord[];
  channels: Channel[];
  watchTargets: WatchTarget[];
}

export function EventFeed({ events, channels, watchTargets }: Props) {
  const now = useMinuteNow();
  const channelMap = new Map(
    channels.map((c) => [c.broadcasterUserId, c])
  );
  const targetMap = new Map(
    watchTargets.map((t) => [t.userId, t])
  );

  return (
    <div className="section-card">
      <div className="section-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--muted)" }}>
          <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="section-title">検知ログ</span>
        {events.length > 0 && (
          <span className="section-count">{events.length}</span>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <div className="mb-3">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ color: "var(--muted)", margin: "0 auto", opacity: 0.25 }}>
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 24h16M24 16v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            まだ検知イベントはありません
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)", opacity: 0.6 }}>
            監視対象ユーザがチャットに現れると表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event, i) => {
            const channel = channelMap.get(event.channelBroadcasterId);
            const target = targetMap.get(event.chatterUserId);
            const profileImageUrl = target?.profileImageUrl;
            const displayName =
              event.chatterDisplayName ||
              target?.displayName ||
              event.chatterLogin;

            return (
              <div
                key={event.messageId || i}
                className="glass-card px-4 py-3 animate-fade-in"
                style={{
                  animationDelay: `${i * 25}ms`,
                  borderLeft: "2px solid var(--accent)",
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {/* User avatar */}
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt={displayName}
                      className="h-5 w-5 rounded-full shrink-0 object-cover"
                      style={{
                        border: "1.5px solid var(--accent)",
                      }}
                    />
                  ) : (
                    <div
                      className="h-5 w-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: "var(--accent-glow)",
                        color: "var(--accent-light)",
                      }}
                    >
                      {displayName[0]?.toUpperCase()}
                    </div>
                  )}

                  <a
                    href={`https://twitch.tv/${event.chatterLogin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-xs hover:underline"
                    style={{ color: "var(--accent-light)" }}
                  >
                    {displayName}
                  </a>

                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: "var(--muted)", opacity: 0.5 }}>
                    <path d="M3 5h4M5.5 3L7 5l-1.5 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>

                  <a
                    href={`https://twitch.tv/${channel?.login || ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline truncate"
                    style={{ color: "var(--muted)" }}
                  >
                    {channel?.displayName || event.channelBroadcasterId}
                  </a>

                  <span
                    className="ml-auto shrink-0 text-[10px] font-medium"
                    style={{ color: "var(--muted)", opacity: 0.7 }}
                  >
                    {timeAgo(event.detectedAt, now)}
                  </span>
                </div>

                <p
                  className="text-sm break-words pl-7 leading-relaxed"
                  style={{ color: "var(--foreground-dim)" }}
                >
                  <ChatMessage
                    messageText={event.messageText}
                    fragments={event.messageFragments}
                  />
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
