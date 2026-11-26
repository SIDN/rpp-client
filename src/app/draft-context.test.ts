import { describe, expect, it, vi } from "vitest";
import { createDraftStore, draftKey } from "./draft-context";

describe("draft store", () => {
  it("keeps values and tells only those subscribed to the key", () => {
    const store = createDraftStore();
    const listener = vi.fn();
    const other = vi.fn();
    store.subscribe("a", listener);
    store.subscribe("b", other);
    store.set("a", 1);
    expect(store.get("a")).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("seeds a value without telling anyone", () => {
    const store = createDraftStore();
    const listener = vi.fn();
    store.subscribe("a", listener);
    store.seed("a", "x");
    expect(store.has("a")).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops telling a listener that unsubscribed", () => {
    const store = createDraftStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe("a", listener);
    unsubscribe();
    store.set("a", 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("drops the drafts of every other connection, and of none while disconnected", () => {
    const store = createDraftStore();
    store.set(draftKey(1, "domains/transfer"), { authInfo: "secret" });
    store.set(draftKey(2, "domains/name"), "example.test");
    store.retain(2);
    expect(store.has(draftKey(1, "domains/transfer"))).toBe(false);
    expect(store.get(draftKey(2, "domains/name"))).toBe("example.test");
    store.retain(undefined);
    expect(store.has(draftKey(2, "domains/name"))).toBe(false);
  });

  it("does not take connection 1 for a prefix of connection 12", () => {
    const store = createDraftStore();
    store.set(draftKey(12, "a"), 1);
    store.retain(1);
    expect(store.has(draftKey(12, "a"))).toBe(false);
  });
});
