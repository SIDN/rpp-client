import { describe, expect, it } from "vitest";
import { formatDateTime } from "./dateTime";

describe("formatDateTime", () => {
  it("shows UTC when asked to", () => {
    expect(formatDateTime("2025-03-04T05:06:07+01:00", "utc")).toBe("2025-03-04 04:06:07 UTC");
  });

  it("uses the local format by default", () => {
    expect(formatDateTime("2025-03-04T05:06:07Z")).toBe(new Date("2025-03-04T05:06:07Z").toLocaleString());
  });

  it("returns what is not a date as it is", () => {
    expect(formatDateTime("soon", "utc")).toBe("soon");
  });
});
