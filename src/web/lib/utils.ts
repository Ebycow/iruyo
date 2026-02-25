export function timeAgo(dateStr: string, now = Date.now()): string {
  const then = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z").getTime();
  const diff = now - then;

  if (diff < 60_000) return "たった今";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
