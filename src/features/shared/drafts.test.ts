import { describe, expect, it } from "vitest";
import { sameValues } from "./drafts";

describe("sameValues", () => {
  it("compares form values member by member, whatever their order", () => {
    expect(sameValues({ a: "1", b: [{ host: "x" }] }, { b: [{ host: "x" }], a: "1" })).toBe(true);
    expect(sameValues({ a: "1" }, { a: "2" })).toBe(false);
    expect(sameValues({ a: [] }, { a: [""] })).toBe(false);
    expect(sameValues({ a: "1" }, { a: "1", b: "" })).toBe(false);
    expect(sameValues([], {})).toBe(false);
    expect(sameValues(null, {})).toBe(false);
  });
});
