import { describe, expect, it } from "vitest";
import {
  estimateSubtotal,
  formatAbsoluteTime,
  formatBytes,
  formatMoney,
  formatRelativeTime,
  formatWeight,
} from "./format.js";

describe("formatMoney", () => {
  it("formats decimal strings as USD", () => {
    expect(formatMoney("19.99")).toBe("$19.99");
    expect(formatMoney("0.05")).toBe("$0.05");
    expect(formatMoney("1000")).toBe("$1,000.00");
  });
});

describe("formatWeight", () => {
  it("appends the kilogram unit without changing the value", () => {
    expect(formatWeight("0.350")).toBe("0.350 kg");
  });
});

describe("formatBytes", () => {
  it("scales file sizes to bytes, KiB, and MiB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(24672)).toBe("24.1 KiB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MiB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MiB");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");

  function agoBy(seconds: number): string {
    return formatRelativeTime(new Date(now.getTime() - seconds * 1000).toISOString(), now);
  }

  it("steps through every unit with correct pluralisation", () => {
    expect(agoBy(0)).toBe("0 seconds ago");
    expect(agoBy(1)).toBe("1 second ago");
    expect(agoBy(45)).toBe("45 seconds ago");
    expect(agoBy(60)).toBe("1 minute ago");
    expect(agoBy(300)).toBe("5 minutes ago");
    expect(agoBy(3600)).toBe("1 hour ago");
    expect(agoBy(7200)).toBe("2 hours ago");
    expect(agoBy(86400)).toBe("1 day ago");
    expect(agoBy(86400 * 6)).toBe("6 days ago");
    expect(agoBy(86400 * 30)).toBe("1 month ago");
    expect(agoBy(86400 * 90)).toBe("3 months ago");
    expect(agoBy(86400 * 365)).toBe("1 year ago");
    expect(agoBy(86400 * 800)).toBe("2 years ago");
  });

  it("treats clock skew into the future as zero seconds", () => {
    expect(formatRelativeTime(new Date(now.getTime() + 5000).toISOString(), now)).toBe(
      "0 seconds ago",
    );
  });

  it("passes unparseable input through instead of inventing a time", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("not-a-date");
  });
});

describe("formatAbsoluteTime", () => {
  it("renders a human-readable date and time for the tooltip", () => {
    const formatted = formatAbsoluteTime("2026-10-18T12:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).not.toBe("2026-10-18T12:00:00.000Z");
  });

  it("passes unparseable input through", () => {
    expect(formatAbsoluteTime("nope")).toBe("nope");
  });
});

describe("estimateSubtotal", () => {
  it("multiplies exactly without floating-point drift", () => {
    expect(estimateSubtotal([{ price: "0.10", quantity: 3 }])).toBe("0.30");
    expect(
      estimateSubtotal([
        { price: "19.99", quantity: 2 },
        { price: "0.10", quantity: 3 },
      ]),
    ).toBe("40.28");
    expect(estimateSubtotal([])).toBe("0.00");
  });
});
