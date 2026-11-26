import { describe, expect, it } from "vitest";
import { RppError } from "../errors/RppError";
import { applyPatch, matches } from "./patch";

const DOMAIN = {
  "@type": "domainName",
  name: "example.example",
  contacts: [
    { label: "admin", object: { "@type": "contact", id: "REG-100" } },
    { label: "tech", object: { "@type": "contact", id: "REG-200" } },
    { label: "tech", object: { "@type": "contact", id: "REG-300" } },
  ],
  registrant: { "@type": "contact", id: "REG-1" },
};

describe("matching (json §5.2.1)", () => {
  it("matches the draft's examples", () => {
    expect(matches(DOMAIN.contacts[1], { label: "tech", object: { "@type": "contact", id: "REG-200" } })).toBe(true);
    expect(matches(DOMAIN.contacts[1], { label: "tech", object: { id: "REG-300" } })).toBe(false);
    const lgr = [{ tld: ["example", "org"] }, { tld: ["example"] }];
    expect(lgr.map((element) => matches(element, { tld: ["org", "example"] }))).toEqual([true, false]);
    expect(matches("x", { a: 1 })).toBe(false);
  });
});

describe("applying a partial update (json §5.2.2)", () => {
  it("appends on add, removes and replaces what match selects, and sets or removes members", () => {
    const result = applyPatch(DOMAIN, [
      { op: "add", path: "/contacts", value: { label: "billing", object: { "@type": "contact", id: "REG-400" } } },
      { op: "remove", path: "/contacts", match: { label: "tech" } },
      { op: "replace", path: "/contacts", match: { label: "admin" }, value: { label: "admin", object: { "@type": "contact", id: "REG-101" } } },
      { op: "replace", path: "/registrant", value: { "@type": "contact", id: "REG-2" } },
      { op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: "x" } },
    ]);
    expect(result).toEqual({
      "@type": "domainName",
      name: "example.example",
      contacts: [
        { label: "admin", object: { "@type": "contact", id: "REG-101" } },
        { label: "billing", object: { "@type": "contact", id: "REG-400" } },
      ],
      registrant: { "@type": "contact", id: "REG-2" },
      authInfo: { "@type": "authInfo", method: "authinfo", authdata: "x" },
    });
    expect(DOMAIN.contacts).toHaveLength(3);
  });

  it("goes into nested members and removes a whole array without match", () => {
    const host = { "@type": "host", dns: { "@type": "dnsData", records: [{ type: "a", rdata: { address: "192.0.2.1" } }] } };
    expect(applyPatch(host, [{ op: "remove", path: "/dns/records", match: { type: "a", rdata: { address: "192.0.2.1" } } }])).toEqual({
      "@type": "host",
      dns: { "@type": "dnsData", records: [] },
    });
    expect(applyPatch(host, [{ op: "remove", path: "/dns/records" }])).toEqual({ "@type": "host", dns: { "@type": "dnsData" } });
  });

  it("fails as a server would, naming the operation", () => {
    const fail = (operations: Parameters<typeof applyPatch>[1]) => {
      try {
        applyPatch(DOMAIN, operations);
      } catch (error) {
        expect(error).toBeInstanceOf(RppError);
        return (error as RppError).message;
      }
      return "applied";
    };
    expect(fail([{ op: "remove", path: "/contacts", match: { label: "billing" } }])).toContain("Patch operation 0 (remove /contacts): no element matches");
    expect(fail([{ op: "replace", path: "/contacts", match: { label: "tech" }, value: {} }])).toContain("more than one element matches");
    expect(fail([{ op: "remove", path: "/authInfo" }])).toContain("authInfo does not exist");
    expect(fail([{ op: "add", path: "/dns/records", value: {} }])).toContain("dns does not exist");
    expect(fail([{ op: "remove", path: "/registrant", match: { id: "REG-1" } }])).toContain("match needs an array");
  });
});
