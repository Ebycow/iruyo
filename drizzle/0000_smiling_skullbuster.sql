CREATE TABLE `active_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`connection_index` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`login` text NOT NULL,
	`display_name` text NOT NULL,
	`is_live` integer DEFAULT false NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_broadcaster_user_id_unique` ON `channels` (`broadcaster_user_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_broadcaster_id` text NOT NULL,
	`chatter_user_id` text NOT NULL,
	`chatter_login` text NOT NULL,
	`message_text` text NOT NULL,
	`message_id` text NOT NULL,
	`detected_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_message_id_unique` ON `events` (`message_id`);--> statement-breakpoint
CREATE TABLE `watch_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`login` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_targets_user_id_unique` ON `watch_targets` (`user_id`);