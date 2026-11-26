import { describe, expect, it } from "vitest";
import presetSchema from "@/test/fixtures/rri-preset-schema.json";
import { fullUpdateOf } from "./objectUpdate";

const CONTACT = {
  "@type": "contact",
  id: "DENIC-1000022-X",
  provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022" },
  status: [{ "@type": "contactStatus", label: "ok" }],
  contactInfo: { "@type": "Card", version: "2.0", kind: "individual", name: { full: "Erika Mustermann" } },
};

describe("full update from the edits of a partial one", () => {
  it("applies the edits and keeps what the update view holds", () => {
    const full = fullUpdateOf(presetSchema, "contact.update", CONTACT, [
      { op: "add", path: "/status", value: { "@type": "contactStatus", label: "clientUpdateProhibited" } },
      { op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: "pw" } },
    ]);
    expect(full).toMatchObject({
      status: "ready",
      body: {
        "@type": "contact",
        status: [{ "@type": "contactStatus", label: "clientUpdateProhibited" }],
        contactInfo: CONTACT.contactInfo,
        authInfo: { "@type": "authInfo", method: "authinfo", authdata: "pw" },
      },
      includeElements: ["authInfo"],
    });
    expect(full.status === "ready" && full.dropped.sort()).toEqual(["/id", "/provMetadata", "/status/0"]);
    expect(full.status === "ready" && full.cleared).toEqual(["disclose"]);
  });

  it("leaves an onDemand member out of the PUT unless the edits change it", () => {
    // Not named: not part of the PUT, so the server keeps it, and not sent even when the read showed it.
    const kept = fullUpdateOf(presetSchema, "contact.update", { ...CONTACT, authInfo: { "@type": "authInfo", method: "authinfo", authdata: "old" } }, [
      { op: "add", path: "/status", value: { "@type": "contactStatus", label: "clientDeleteProhibited" } },
    ]);
    expect(kept).toMatchObject({ status: "ready", includeElements: [] });
    expect(kept.status === "ready" && "authInfo" in kept.body).toBe(false);
    expect(kept.status === "ready" && kept.cleared).not.toContain("authInfo");

    // Removed: named, so the PUT includes it and its absence clears it.
    const removed = fullUpdateOf(presetSchema, "contact.update", CONTACT, [{ op: "remove", path: "/authInfo" }]);
    expect(removed).toMatchObject({ status: "ready", includeElements: ["authInfo"] });
    expect(removed.status === "ready" && "authInfo" in removed.body).toBe(false);

    expect(fullUpdateOf(presetSchema, "host.update", { "@type": "host", hostName: "ns1.foo.de" }, [])).toMatchObject({
      status: "ready",
      body: { "@type": "host", hostName: "ns1.foo.de" },
      includeElements: [],
    });
  });

  it("is not offered without the schema, or when an edit cannot apply", () => {
    expect(fullUpdateOf(undefined, "contact.update", CONTACT, [])).toMatchObject({ status: "unavailable" });
    expect(fullUpdateOf(presetSchema, "nothing.update", CONTACT, [])).toMatchObject({ status: "unavailable", reason: expect.stringContaining("nothing.update") });
    expect(fullUpdateOf(presetSchema, "host.update", { "@type": "host", hostName: "x" }, [{ op: "add", path: "/dns/records", value: {} }])).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("dns does not exist"),
    });
  });
});
