const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatHumanRelativeDate(input: string | Date, now = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const dayDiff = Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / MS_PER_DAY
  );
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (dayDiff === 0) return `Today, ${timeLabel}`;
  if (dayDiff === 1) return `Yesterday, ${timeLabel}`;
  if (dayDiff > 1 && dayDiff < 30) return `${dayDiff} day${dayDiff === 1 ? "" : "s"} ago`;

  if (dayDiff === -1) return `Tomorrow, ${timeLabel}`;
  if (dayDiff < -1) {
    const daysAhead = Math.abs(dayDiff);
    return `In ${daysAhead} day${daysAhead === 1 ? "" : "s"}`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
