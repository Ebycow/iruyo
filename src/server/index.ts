import "dotenv/config";
import { sqlite } from "@shared/db/index";
import { config } from "./config";
import { validateToken } from "./twitch/auth";
import { syncCsv, startCsvSync, stopCsvSync } from "./services/csv-sync";
import { StreamChecker, type StreamStatusChange } from "./services/stream-checker";
import { ChatIngest } from "./services/chat-ingest";
import { Notifier } from "./services/notifier";
import { DiscordNotifier } from "./services/discord-notifier";

async function processChanges(
  changes: StreamStatusChange[],
  chatIngest: ChatIngest,
  notifier: Notifier
) {
  for (const change of changes) {
    await chatIngest.onStreamStatusChanged(change);
    notifier.notifyStreamStatus(change);
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
  const notifier = new Notifier();
  const streamChecker = new StreamChecker();
  const chatIngest = new ChatIngest();
  const discordNotifier = new DiscordNotifier(config.discordWebhookUrl);

  // 3. Start notifier (WebSocket server for frontend)
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
      await processChanges(changes, chatIngest, notifier);
    }
  });

  // 5. Load watch targets & start periodic sync (picks up web UI changes)
  chatIngest.refreshWatchTargets();
  chatIngest.startWatchTargetSync();

  // 6. Stream checker — detect live/offline changes (batch handler)
  streamChecker.on("status_changed", async (changes: StreamStatusChange[]) => {
    await processChanges(changes, chatIngest, notifier);
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
