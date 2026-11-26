import { describe, expect, it } from "vitest";
import type { Bookmark } from "./bookmarks";
import { DEFAULT_PRESET_SETTINGS } from "./connectionProfile";
import { autoConnectProfile, defaultBookmark } from "./defaultConnection";

const open: Bookmark = {
  id: "a",
  name: "Open",
  profile: { baseUrl: "https://rpp.example/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" },
};
const signedIn: Bookmark = { id: "b", name: "Signed in", profile: { ...open.profile, auth: { type: "basic", username: "me" } } };

describe("default connection", () => {
  it("finds the default bookmark, if it still exists", () => {
    expect(defaultBookmark({ defaultBookmarkId: "b" }, [open, signedIn])).toBe(signedIn);
    expect(defaultBookmark({ defaultBookmarkId: "gone" }, [open])).toBeUndefined();
    expect(defaultBookmark({ defaultBookmarkId: undefined }, [open])).toBeUndefined();
  });

  it("connects at start only when asked to, and only without a password", () => {
    expect(autoConnectProfile({ defaultBookmarkId: "a", autoConnect: true }, [open])).toBe(open.profile);
    expect(autoConnectProfile({ defaultBookmarkId: "a", autoConnect: false }, [open])).toBeUndefined();
    expect(autoConnectProfile({ defaultBookmarkId: "b", autoConnect: true }, [signedIn])).toBeUndefined();
    expect(autoConnectProfile({ defaultBookmarkId: undefined, autoConnect: true }, [open])).toBeUndefined();
  });
});
