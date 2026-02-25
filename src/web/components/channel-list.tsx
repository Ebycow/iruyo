"use client";

import type { Channel, WatchTarget } from "@/hooks/use-websocket";

interface Props {
  channels: Channel[];
  watchTargets: WatchTarget[];
  seenTargetsByChannel: Record<string, string[]>;
}

export function ChannelList({
  channels,
  watchTargets,
  seenTargetsByChannel,
}: Props) {
  const liveChannels = channels.filter((c) => c.isLive);
  const offlineChannels = channels.filter((c) => !c.isLive);
  const targetsById = new Map(watchTargets.map((target) => [target.userId, target]));
  const targetsByChannel = new Map<string, WatchTarget[]>();

  for (const [channelId, targetIds] of Object.entries(seenTargetsByChannel)) {
    const list: WatchTarget[] = [];
    for (const targetId of targetIds) {
      const target = targetsById.get(targetId);
      if (target) list.push(target);
    }
    if (list.length > 0) targetsByChannel.set(channelId, list);
  }

  return (
    <div className="section-card">
      <div className="section-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--muted)" }}>
          <path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="section-title">チャンネル</span>
        <span className="section-count">
          {liveChannels.length}/{channels.length}
        </span>
      </div>

      <div className="grid gap-1.5">
        {liveChannels.map((ch, i) => (
          <ChannelCard
            key={ch.broadcasterUserId}
            channel={ch}
            targets={targetsByChannel.get(ch.broadcasterUserId) || []}
            index={i}
          />
        ))}
        {offlineChannels.map((ch, i) => (
          <ChannelCard
            key={ch.broadcasterUserId}
            channel={ch}
            targets={targetsByChannel.get(ch.broadcasterUserId) || []}
            index={liveChannels.length + i}
          />
        ))}
      </div>

      {channels.length === 0 && (
        <p className="text-xs text-center py-6" style={{ color: "var(--muted)" }}>
          チャンネルがありません
        </p>
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  targets,
  index,
}: {
  channel: Channel;
  targets: WatchTarget[];
  index: number;
}) {
  return (
    <a
      href={`https://twitch.tv/${channel.login}`}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-card flex flex-col gap-1.5 px-3 py-2.5 animate-fade-in"
      style={{
        animationDelay: `${index * 30}ms`,
        borderLeft: channel.isLive
          ? "2px solid var(--live)"
          : "2px solid transparent",
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* Channel avatar */}
        {channel.profileImageUrl ? (
          <img
            src={channel.profileImageUrl}
            alt={channel.displayName}
            className="h-7 w-7 rounded-full shrink-0 object-cover"
            style={{
              border: channel.isLive
                ? "2px solid var(--live)"
                : "2px solid var(--border)",
              boxShadow: channel.isLive
                ? "0 0 8px var(--live-glow)"
                : "none",
            }}
          />
        ) : (
          <div
            className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
            style={{
              background: channel.isLive
                ? "linear-gradient(135deg, var(--live), #ff6b6b)"
                : "rgba(255, 255, 255, 0.06)",
              color: channel.isLive ? "white" : "var(--muted)",
            }}
          >
            {channel.displayName[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium truncate block" style={{
            color: channel.isLive ? "var(--foreground)" : "var(--muted)",
          }}>
            {channel.displayName}
          </span>
        </div>
        {channel.isLive ? (
          <span className="badge badge-live animate-pulse-glow">
            LIVE
          </span>
        ) : (
          <span className="badge badge-offline">
            OFF
          </span>
        )}
      </div>
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-9">
          {targets.map((target) => {
            const initial = target.displayName?.[0]?.toUpperCase() ?? "?";
            return target.profileImageUrl ? (
              <img
                key={target.userId}
                src={target.profileImageUrl}
                alt={target.displayName}
                title={target.displayName}
                className="h-5 w-5 rounded-full"
                style={{
                  border: "1.5px solid var(--accent)",
                  boxShadow: "0 0 6px var(--accent-glow)",
                }}
              />
            ) : (
              <div
                key={target.userId}
                className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                title={target.displayName}
                style={{
                  background: "var(--accent-glow)",
                  color: "var(--accent-light)",
                  border: "1.5px solid var(--accent)",
                }}
              >
                {initial}
              </div>
            );
          })}
        </div>
      )}
    </a>
  );
}
