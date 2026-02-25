"use client";

import { useState } from "react";
import { useMinuteNow } from "@/hooks/use-minute-now";
import type { WatchTarget, EventRecord, Channel } from "@/hooks/use-websocket";
import { timeAgo } from "@/lib/utils";
import { ChatMessage } from "./chat-message";

interface Props {
  watchTargets: WatchTarget[];
  events: EventRecord[];
  channels: Channel[];
  onAdd: (target: WatchTarget) => void;
  onRemove: (userId: string) => void;
  onToggleDiscord: (userId: string, notifyDiscord: boolean) => void;
}

export function TargetList({
  watchTargets,
  events,
  channels,
  onAdd,
  onRemove,
  onToggleDiscord,
}: Props) {
  const now = useMinuteNow();
  const [login, setLogin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const channelMap = new Map(
    channels.map((c) => [c.broadcasterUserId, c])
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = login.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.__NEXT_ROUTER_BASEPATH || ""}/api/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "追加に失敗しました");
        return;
      }

      onAdd(data.target);
      setLogin("");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      const res = await fetch(`${process.env.__NEXT_ROUTER_BASEPATH || ""}/api/targets?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        onRemove(userId);
      }
    } catch {
      // ignore
    }
  }

  async function handleToggleDiscord(target: WatchTarget) {
    const nextValue = !target.notifyDiscord;
    try {
      const res = await fetch(`${process.env.__NEXT_ROUTER_BASEPATH || ""}/api/targets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.userId, notifyDiscord: nextValue }),
      });

      if (res.ok) {
        onToggleDiscord(target.userId, nextValue);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="section-card">
      <div className="section-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--muted)" }}>
          <path d="M8 1a3 3 0 100 6 3 3 0 000-6zM3 13c0-2.76 2.24-4 5-4s5 1.24 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="section-title">監視対象</span>
        <span className="section-count">{watchTargets.length}</span>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Twitchユーザ名を入力..."
          disabled={loading}
          className="input-field flex-1 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !login.trim()}
          className="btn-primary px-4 py-2 text-sm"
        >
          {loading ? (
            <span className="inline-block animate-spin">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10" />
              </svg>
            </span>
          ) : (
            "追加"
          )}
        </button>
      </form>
      {error && (
        <div
          className="text-xs px-3 py-2 rounded-lg mb-3"
          style={{
            background: "var(--live-glow)",
            color: "var(--live)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      {watchTargets.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-2xl mb-2" style={{ opacity: 0.3 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: "var(--muted)", margin: "0 auto" }}>
              <circle cx="20" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 32c0-6.63 5.37-10 12-10s12 3.37 12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            監視対象ユーザが登録されていません
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {watchTargets.map((target, i) => {
            const lastEvent = events.find(
              (e) => e.chatterUserId === target.userId
            );
            const channelInfo = lastEvent
              ? channelMap.get(lastEvent.channelBroadcasterId)
              : null;

            return (
              <div
                key={target.userId}
                className="glass-card p-3 animate-fade-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center gap-2.5">
                  {/* Profile image */}
                  {target.profileImageUrl ? (
                    <img
                      src={target.profileImageUrl}
                      alt={target.displayName}
                      className="h-8 w-8 rounded-full shrink-0"
                      style={{
                        border: "2px solid var(--accent)",
                        boxShadow: "0 0 8px var(--accent-glow)",
                      }}
                    />
                  ) : (
                    <div
                      className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{
                        background: "var(--accent-glow)",
                        color: "var(--accent-light)",
                        border: "2px solid var(--accent)",
                      }}
                    >
                      {target.displayName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://twitch.tv/${target.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sm hover:underline block truncate"
                      style={{ color: "var(--accent-light)" }}
                    >
                      {target.displayName}
                    </a>
                    {lastEvent && (
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                        {timeAgo(lastEvent.detectedAt, now)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleDiscord(target)}
                      className={`toggle-btn ${target.notifyDiscord ? "toggle-btn-active" : "toggle-btn-inactive"}`}
                      title="Discord通知"
                      aria-pressed={target.notifyDiscord}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRemove(target.userId)}
                      className="h-6 w-6 rounded-full flex items-center justify-center transition-colors"
                      style={{
                        color: "var(--muted)",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--live-glow)";
                        e.currentTarget.style.color = "var(--live)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--muted)";
                      }}
                      title="削除"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {lastEvent ? (
                  <div
                    className="mt-2 px-3 py-2 rounded-lg text-xs"
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>
                      {channelInfo?.displayName || lastEvent.channelBroadcasterId}:
                    </span>{" "}
                    <span className="block mt-0.5 whitespace-pre-wrap" style={{ color: "var(--foreground-dim)", overflowWrap: "anywhere" }}>
                      <ChatMessage
                        messageText={lastEvent.messageText}
                        fragments={lastEvent.messageFragments}
                      />
                    </span>
                  </div>
                ) : (
                  <p
                    className="text-[11px] mt-1.5 pl-10"
                    style={{ color: "var(--muted)" }}
                  >
                    まだ検知されていません
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
