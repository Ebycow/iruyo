import fs from "fs";
import { db, schema } from "@shared/db/index";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { getUsersById } from "../twitch/helix";

interface CsvRow {
  login: string;
  id: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  return lines.slice(1).flatMap((line) => {
    const [name, id] = line.trim().split(",");
    if (!name || !id) return [];
    return [{ login: name.trim(), id: id.trim() }];
  });
}

export async function syncCsv(): Promise<{
  added: string[];
  updated: string[];
}> {
  const csvPath = config.csvPath;
  if (!fs.existsSync(csvPath)) {
    console.warn(`[csv-sync] CSV not found: ${csvPath}`);
    return { added: [], updated: [] };
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(content);
  const added: string[] = [];
  const updated: string[] = [];

  const userIds = Array.from(new Set(rows.map((row) => row.id)));
  const users = await getUsersById(userIds);
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const row of rows) {
    const resolved = usersById.get(row.id);
    const nextLogin = resolved?.login ?? row.login;
    const resolvedDisplayName = resolved?.display_name;
    const resolvedProfileImageUrl = resolved?.profile_image_url ?? null;
    const existing = db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.broadcasterUserId, row.id))
      .get();

    if (!existing) {
      const insertDisplayName = resolvedDisplayName ?? row.login;
      db.insert(schema.channels)
        .values({
          broadcasterUserId: row.id,
          login: nextLogin,
          displayName: insertDisplayName,
          profileImageUrl: resolvedProfileImageUrl,
        })
        .run();
      added.push(nextLogin);
    } else if (
      existing.login !== nextLogin ||
      existing.displayName !== (resolvedDisplayName ?? existing.displayName) ||
      existing.profileImageUrl !== (resolvedProfileImageUrl ?? existing.profileImageUrl)
    ) {
      db.update(schema.channels)
        .set({
          login: nextLogin,
          displayName: resolvedDisplayName ?? existing.displayName,
          profileImageUrl: resolvedProfileImageUrl ?? existing.profileImageUrl,
        })
        .where(eq(schema.channels.broadcasterUserId, row.id))
        .run();
      updated.push(nextLogin);
    }
  }

  if (added.length > 0 || updated.length > 0) {
    console.log(
      `[csv-sync] added: ${added.length}, updated: ${updated.length}`
    );
  }

  return { added, updated };
}

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startCsvSync(onSync?: (result: { added: string[] }) => void) {
  // Periodic sync only — initial sync should be done by caller via syncCsv()
  syncTimer = setInterval(async () => {
    const result = await syncCsv();
    if (result.added.length > 0) {
      onSync?.(result);
    }
  }, config.csvSyncIntervalMs);

  console.log(
    `[csv-sync] Started. Interval: ${config.csvSyncIntervalMs / 1000}s, Path: ${config.csvPath}`
  );
}

export function stopCsvSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
