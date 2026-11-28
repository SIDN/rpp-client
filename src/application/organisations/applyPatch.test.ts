import { describe, expect, it } from "vitest";
import { applyPatch } from "./applyPatch";

describe("applyPatch", () => {
  const object = { id: "x", name: { full: "A" }, list: [{ label: "admin", object: { id: "C-1" } }, { label: "tech", object: { id: "C-2" } }] };

  it("sets, replaces and removes members on a copy", () => {
    const patched = applyPatch(object, [
      { op: "replace", path: "/name/full", value: "B" },
      { op: "add", path: "/roles", value: { "a~/b": 1 } },
      { op: "remove", path: "/id" },
      { op: "add", path: "/roles/a~1b", value: 2 },
    ]);
    expect(patched).toEqual({ name: { full: "B" }, roles: { "a~/b": 1, "a/b": 2 }, list: object.list });
    expect(object.id).toBe("x");
    expect(object.name.full).toBe("A");
  });

  it("appends to an array on add, and removes or replaces the members that match", () => {
    const added = applyPatch(object, [{ op: "add", path: "/list", value: { label: "billing", object: { id: "C-3" } } }]);
    expect(added.list.map((entry) => entry.object.id)).toEqual(["C-1", "C-2", "C-3"]);
    expect(object.list).toHaveLength(2);

    const removed = applyPatch(object, [{ op: "remove", path: "/list", match: { object: { id: "C-1" } } }]);
    expect(removed.list.map((entry) => entry.label)).toEqual(["tech"]);

    const replaced = applyPatch(object, [{ op: "replace", path: "/list", match: { label: "tech" }, value: { label: "tech", object: { id: "C-9" } } }]);
    expect(replaced.list.map((entry) => entry.object.id)).toEqual(["C-1", "C-9"]);
  });

  it("refuses a path that leads nowhere, or a match on something that is not a list", () => {
    expect(() => applyPatch(object, [{ op: "replace", path: "/missing/deeper", value: 1 }])).toThrow(/missing\/deeper/);
    expect(() => applyPatch(object, [{ op: "remove", path: "" }])).toThrow();
    expect(() => applyPatch(object, [{ op: "remove", path: "/name", match: { full: "A" } }])).toThrow(/\/name/);
  });
});
