import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const channels = sqliteTable("channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  broadcasterUserId: text("broadcaster_user_id").notNull().unique(),
  login: text("login").notNull(),
  displayName: text("display_name").notNull(),
  profileImageUrl: text("profile_image_url"),
  isLive: integer("is_live", { mode: "boolean" }).notNull().default(false),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const watchTargets = sqliteTable("watch_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  login: text("login").notNull(),
  displayName: text("display_name").notNull(),
  profileImageUrl: text("profile_image_url"),
  notifyDiscord: integer("notify_discord", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelBroadcasterId: text("channel_broadcaster_id").notNull(),
  chatterUserId: text("chatter_user_id").notNull(),
  chatterLogin: text("chatter_login").notNull(),
  messageText: text("message_text").notNull(),
  messageFragments: text("message_fragments"),
  messageId: text("message_id").notNull().unique(),
  detectedAt: text("detected_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const activeSubscriptions = sqliteTable("active_subscriptions", {
  id: text("id").primaryKey(),
  broadcasterUserId: text("broadcaster_user_id").notNull(),
  connectionIndex: integer("connection_index").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
