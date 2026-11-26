import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./appSettings";

const storageWith = (value: string | null) => ({ getItem: () => value });

describe("app settings", () => {
  it("does not synthesize data unless told to", () => {
    expect(DEFAULT_SETTINGS.synthesizeData).toBe(false);
    expect(loadSettings(storageWith(null))).toEqual(DEFAULT_SETTINGS);
  });

  it("reads what was stored", () => {
    const stored = { ...DEFAULT_SETTINGS, synthesizeData: true, defaultBookmarkId: "bm-1", autoConnect: true, messageLimit: 50, processPageSize: 10, timeDisplay: "utc" };
    expect(loadSettings(storageWith(JSON.stringify(stored)))).toEqual(stored);
  });

  it("falls back to the defaults for what is missing, malformed or not settings", () => {
    expect(loadSettings(storageWith("{}"))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storageWith("not json"))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storageWith(JSON.stringify({ synthesizeData: "yes" })))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storageWith(JSON.stringify([1])))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => { throw new Error("no storage"); } })).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back per option, keeping the ones that are fine", () => {
    const loaded = loadSettings(
      storageWith(JSON.stringify({ synthesizeData: true, messageLimit: -3, processPageSize: "many", timeDisplay: "mars", autoConnect: 1, defaultBookmarkId: 4 })),
    );
    expect(loaded).toEqual({ ...DEFAULT_SETTINGS, synthesizeData: true });
  });

  it("waits 5 seconds for a request unless told otherwise, and takes whole seconds from 1 to 300", () => {
    expect(DEFAULT_SETTINGS.requestTimeoutSeconds).toBe(5);
    expect(loadSettings(storageWith(JSON.stringify({ requestTimeoutSeconds: 20 }))).requestTimeoutSeconds).toBe(20);
    for (const bad of [0, 301, 2.5, "9"]) expect(loadSettings(storageWith(JSON.stringify({ requestTimeoutSeconds: bad }))).requestTimeoutSeconds).toBe(5);
  });

  it("saves them, and survives storage that cannot", () => {
    let stored = "";
    saveSettings({ ...DEFAULT_SETTINGS, synthesizeData: true }, { setItem: (_key, value) => { stored = value; } });
    expect(JSON.parse(stored)).toMatchObject({ synthesizeData: true, messageLimit: 25 });
    expect(() => saveSettings(DEFAULT_SETTINGS, { setItem: () => { throw new Error("full"); } })).not.toThrow();
  });
});
