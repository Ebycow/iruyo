import "dotenv/config";
import { sqlite } from "@shared/db/index";
import { config } from "./config";
import { validateToken } from "./twitch/auth";
import { syncCsv, startCsvSync, stopCsvSync } from "./services/csv-sync";
import { db, schema } from "@shared/db/index";
import { eq } from "drizzle-orm";
import { StreamChecker, type StreamStatusChange } from "./services/stream-checker";
import { ChatIngest } from "./services/chat-ingest";
import { Notifier } from "./services/notifier";
import { DiscordNotifier } from "./services/discord-notifier";
import { BroadcasterNotifier } from "./services/broadcaster-notifier";

async function processChanges(
  changes: StreamStatusChange[],
  chatIngest: ChatIngest,
  notifier: Notifier,
  broadcasterNotifier: BroadcasterNotifier
) {
  for (const change of changes) {
    await chatIngest.onStreamStatusChanged(change);
    notifier.notifyStreamStatus(change);
    await broadcasterNotifier.onStreamStatusChanged(change);
  }
}

async function main() {
  console.log("=== iruyo server starting ===");

  // 0. DB schema is managed via migrations (npm run db:migrate)

  // 1. Validate Twitch token
  const tokenValid = await validateToken();
  if (!tokenValid) {
    console.error(
      "Failed to validate Twitch token. Check TWITCH_BOT_ACCESS_TOKEN and TWITCH_BOT_REFRESH_TOKEN."
    );
    process.exit(1);
  }

  // 2. Initialize services
  const notifyUserIdSet = new Set(config.discordBroadcasterNotifyUserIds);
  const notifier = new Notifier(notifyUserIdSet);
  const streamChecker = new StreamChecker();
  const chatIngest = new ChatIngest();
  const discordNotifier = new DiscordNotifier(config.discordListenerNotifyWebhookUrl);

  // 3. Start notifier (WebSocket server for frontend)
  notifier.setStreamDataGetter((userId) => streamChecker.getLiveStream(userId));
  notifier.start(config.wsNotifyPort);

  // 4. Initial CSV sync — ensure channels are in DB before stream check
  const csvResult = await syncCsv();
  if (csvResult.added.length > 0) {
    console.log(
      `[main] New channels from CSV: ${csvResult.added.join(", ")}`
    );
  }

  // Start periodic CSV sync (handles newly added channels)
  startCsvSync(async (result) => {
    if (result.added.length > 0) {
      console.log(
        `[main] New channels from CSV: ${result.added.join(", ")}`
      );
      const changes = await streamChecker.check();
      await processChanges(changes, chatIngest, notifier, broadcasterNotifier);
    }
  });

  // 5. Load watch targets & start periodic sync (picks up web UI changes)
  chatIngest.refreshWatchTargets();
  chatIngest.startWatchTargetSync();

  // 5.5. Build cold start suppression set and initialize BroadcasterNotifier
  // 起動時点でDBにis_live=trueかつ通知対象の配信者は、最初の開始通知をスキップする
  const coldStartIds = new Set(
    db
      .select({ broadcasterUserId: schema.channels.broadcasterUserId })
      .from(schema.channels)
      .where(eq(schema.channels.isLive, true))
      .all()
      .map((c) => c.broadcasterUserId)
      .filter((id) => notifyUserIdSet.has(id))
  );
  if (coldStartIds.size > 0) {
    console.log(
      `[main] Cold start: suppressing start notifications for ${coldStartIds.size} live broadcaster(s)`
    );
  }
  const broadcasterNotifier = new BroadcasterNotifier(
    config.discordBroadcasterNotifyWebhookUrl,
    notifyUserIdSet,
    coldStartIds
  );

  // 6. Stream checker — detect live/offline changes (batch handler)
  streamChecker.on("status_changed", async (changes: StreamStatusChange[]) => {
    await processChanges(changes, chatIngest, notifier, broadcasterNotifier);
  });
  streamChecker.start();

  // 7. Subscribe to channels that were already live before this restart
  await chatIngest.subscribeToLiveChannels();

  // 8. Forward detected events to notifier
  chatIngest.on("detected", (event) => {
    notifier.notifyDetected(event);
  });

  chatIngest.on("discord_notify", (event) => {
    discordNotifier.notifyDetected(event);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    stopCsvSync();
    streamChecker.stop();
    chatIngest.close();
    notifier.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("=== iruyo server ready ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
