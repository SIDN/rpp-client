import { describe, expect, it } from "vitest";
import { generateTransferCode, TRANSFER_CODE_LENGTH } from "./transferCode";

describe("generateTransferCode", () => {
  it("makes 20 characters with every kind in it, and a different code each time", () => {
    const codes = Array.from({ length: 200 }, generateTransferCode);
    for (const code of codes) {
      expect(code).toHaveLength(TRANSFER_CODE_LENGTH);
      expect(code).toMatch(/[a-z]/);
      expect(code).toMatch(/[A-Z]/);
      expect(code).toMatch(/[0-9]/);
      expect(code).toMatch(/[^A-Za-z0-9]/);
      expect(code).not.toMatch(/[\s"'\\<>]/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});
