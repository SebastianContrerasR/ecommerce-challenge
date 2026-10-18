const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(value: string): string {
  return usdFormatter.format(Number(value));
}

export function formatWeight(value: string): string {
  return `${value} kg`;
}

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_KIB) {
    return `${bytes} B`;
  }
  if (bytes < BYTES_PER_MIB) {
    return `${(bytes / BYTES_PER_KIB).toFixed(1)} KiB`;
  }
  return `${(bytes / BYTES_PER_MIB).toFixed(1)} MiB`;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_MONTH = 30 * SECONDS_PER_DAY;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

function countLabel(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }
  const elapsed = Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
  if (elapsed < SECONDS_PER_MINUTE) {
    return countLabel(elapsed, "second");
  }
  if (elapsed < SECONDS_PER_HOUR) {
    return countLabel(Math.floor(elapsed / SECONDS_PER_MINUTE), "minute");
  }
  if (elapsed < SECONDS_PER_DAY) {
    return countLabel(Math.floor(elapsed / SECONDS_PER_HOUR), "hour");
  }
  if (elapsed < SECONDS_PER_MONTH) {
    return countLabel(Math.floor(elapsed / SECONDS_PER_DAY), "day");
  }
  if (elapsed < SECONDS_PER_YEAR) {
    return countLabel(Math.floor(elapsed / SECONDS_PER_MONTH), "month");
  }
  return countLabel(Math.floor(elapsed / SECONDS_PER_YEAR), "year");
}

export function formatAbsoluteTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }
  return new Date(parsed).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function estimateSubtotal(lines: Array<{ price: string; quantity: number }>): string {
  let totalCents = 0n;
  for (const line of lines) {
    const dot = line.price.indexOf(".");
    const whole = dot === -1 ? line.price : line.price.slice(0, dot);
    const fraction = dot === -1 ? "00" : `${line.price.slice(dot + 1)}00`.slice(0, 2);
    totalCents +=
      (BigInt(whole === "" ? "0" : whole) * 100n + BigInt(fraction)) * BigInt(line.quantity);
  }
  return `${(totalCents / 100n).toString()}.${(totalCents % 100n).toString().padStart(2, "0")}`;
}
