"use client";

import { useEffect, useCallback, useState } from "react";
import { useWebSocket, type WatchTarget } from "@/hooks/use-websocket";
import { ChannelList } from "./channel-list";
import { TargetList } from "./target-list";
import { EventFeed } from "./event-feed";

const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/iruyo/ws`
    : "ws://localhost:3001";

export function Dashboard() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const {
    connected,
    channels,
    watchTargets,
    setWatchTargets,
    events,
    seenTargetsByChannel,
  } = useWebSocket(WS_URL, notificationsEnabled);

  const handleAddTarget = useCallback((target: WatchTarget) => {
    setWatchTargets((prev) => {
      const index = prev.findIndex((t) => t.userId === target.userId);
      if (index === -1) return [...prev, target];
      const current = prev[index];
      const next = [...prev];
      next[index] = {
        ...current,
        ...target,
        notifyDiscord: current.notifyDiscord,
      };
      return next;
    });
  }, [setWatchTargets]);

  const handleRemoveTarget = useCallback((userId: string) => {
    setWatchTargets((prev) => prev.filter((t) => t.userId !== userId));
  }, [setWatchTargets]);

  const handleToggleDiscord = useCallback((userId: string, notifyDiscord: boolean) => {
    setWatchTargets((prev) =>
      prev.map((t) =>
        t.userId === userId ? { ...t, notifyDiscord } : t
      )
    );
  }, [setWatchTargets]);

  // Load notification setting
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("notificationsEnabled");
    if (stored === "false") {
      setNotificationsEnabled(false);
    }
  }, []);

  // Persist notification setting
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("notificationsEnabled", String(notificationsEnabled));
  }, [notificationsEnabled]);

  // Request notification permission when enabled
  useEffect(() => {
    if (
      notificationsEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, [notificationsEnabled]);

  const liveCount = channels.filter((c) => c.isLive).length;

  return (
    <div className="min-h-screen relative" style={{ zIndex: 1 }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 px-6 py-3"
        style={{
          background: "rgba(6, 6, 10, 0.75)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo mark */}
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-extrabold"
              style={{
                background: "var(--accent-gradient)",
                color: "white",
                boxShadow: "0 2px 12px rgba(145, 71, 255, 0.3)",
              }}
            >
              S
            </div>
            <div>
              <h1
                className="text-base font-bold tracking-tight"
                style={{
                  background: "var(--accent-gradient)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                iruyo
              </h1>
              <p className="text-[11px] -mt-0.5" style={{ color: "var(--muted)" }}>
                Twitch Chat Monitor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live count */}
            {liveCount > 0 && (
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 w-1.5 rounded-full animate-pulse-dot"
                  style={{ background: "var(--live)" }}
                />
                <span className="text-xs font-medium" style={{ color: "var(--foreground-dim)" }}>
                  {liveCount} LIVE
                </span>
              </div>
            )}

            {/* Notifications toggle */}
            <button
              type="button"
              onClick={() => setNotificationsEnabled((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium transition"
              style={{
                background: notificationsEnabled
                  ? "rgba(34, 197, 94, 0.15)"
                  : "rgba(100, 116, 139, 0.2)",
                border: `1px solid ${notificationsEnabled ? "rgba(34, 197, 94, 0.3)" : "rgba(148, 163, 184, 0.3)"}`,
                color: notificationsEnabled ? "var(--success)" : "var(--foreground-dim)",
              }}
              aria-pressed={notificationsEnabled}
            >
              <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{
                background: notificationsEnabled ? "var(--success)" : "var(--foreground-dim)",
                boxShadow: notificationsEnabled ? "0 0 6px var(--success-glow)" : "none",
              }} />
              通知 {notificationsEnabled ? "オン" : "オフ"}
            </button>

            {/* Connection status */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: connected
                  ? "var(--success-glow)"
                  : "var(--live-glow)",
                border: `1px solid ${connected ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
              }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: connected ? "var(--success)" : "var(--live)",
                  boxShadow: connected
                    ? "0 0 6px var(--success-glow)"
                    : "0 0 6px var(--live-glow)",
                }}
              />
              <span className="text-[11px] font-medium" style={{
                color: connected ? "var(--success)" : "var(--live)",
              }}>
                {connected ? "接続中" : "切断"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-5">
          {/* Left: Channels */}
          <aside className="lg:max-h-[calc(100vh-76px)] lg:overflow-y-auto lg:sticky lg:top-[64px]">
            <ChannelList
              channels={channels}
              watchTargets={watchTargets}
              seenTargetsByChannel={seenTargetsByChannel}
            />
          </aside>

          {/* Center: Event Feed */}
          <section>
            <EventFeed events={events} channels={channels} watchTargets={watchTargets} />
          </section>

          {/* Right: Watch Targets */}
          <aside className="lg:max-h-[calc(100vh-76px)] lg:overflow-y-auto lg:sticky lg:top-[64px]">
            <TargetList
              watchTargets={watchTargets}
              events={events}
              channels={channels}
              onAdd={handleAddTarget}
              onRemove={handleRemoveTarget}
              onToggleDiscord={handleToggleDiscord}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
