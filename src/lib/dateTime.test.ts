import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./dateTime";

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

describe("formatDate", () => {
  it("shows the UTC date without the time", () => {
    expect(formatDate("2025-03-04T23:30:00-02:00", "utc")).toBe("2025-03-05 UTC");
    expect(formatDate("later")).toBe("later");
  });
});
