import { describe, expect, it } from "vitest";
import { describeRecord, dnsRecordInputOf, dnsRecordOf, ownerNameProblem, recordProblems, sameRecord } from "./dnsRecords";

describe("DNS record inputs", () => {
  it("builds records with lowercase types and string RDATA named after the RFC fields", () => {
    expect(dnsRecordOf({ type: "ns", name: " @ ", nsdname: " ns1.example.de " })).toEqual({ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.de" } });
    expect(dnsRecordOf({ type: "a", name: "ns1", address: "192.0.2.1" })).toEqual({ "@type": "dnsRecord", name: "ns1", type: "a", rdata: { address: "192.0.2.1" } });
    expect(dnsRecordOf({ type: "aaaa", name: "ns1.example.de.", address: "2001:db8::1" }).rdata).toEqual({ address: "2001:db8::1" });
    expect(dnsRecordOf({ type: "mx", name: "@", preference: "10", exchange: "mail.example.net" }).rdata).toEqual({ preference: "10", exchange: "mail.example.net" });
  });

  it("does not change the values otherwise: no trailing dot added or removed, no case change", () => {
    expect(dnsRecordOf({ type: "ns", name: "@", nsdname: "NS1.Example.DE." }).rdata).toEqual({ nsdname: "NS1.Example.DE." });
  });

  it("reads back what it writes and leaves records of other types or other RDATA alone", () => {
    expect(dnsRecordInputOf({ "@type": "dnsRecord", name: "@", type: "MX", rdata: { preference: "5", exchange: "m.example" } })).toEqual({ type: "mx", name: "@", preference: "5", exchange: "m.example" });
    expect(dnsRecordInputOf({ "@type": "dnsRecord", name: "@", type: "ds", rdata: { keyTag: "1" } })).toBeUndefined();
    expect(dnsRecordInputOf({ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: 7 } })).toBeUndefined();
    expect(dnsRecordInputOf({ "@type": "dnsRecord", name: "@", type: "mx", rdata: { exchange: "m.example" } })).toBeUndefined();
  });

  it("compares records as DNS does, without case", () => {
    expect(sameRecord({ type: "ns", name: "@", nsdname: "NS1.example" }, { type: "ns", name: "@", nsdname: "ns1.example" })).toBe(true);
    expect(sameRecord({ type: "a", name: "ns1", address: "192.0.2.1" }, { type: "a", name: "ns2", address: "192.0.2.1" })).toBe(false);
  });
});

describe("owner names (data objects §9.9, §11.2)", () => {
  it("takes @, relative names and absolute names at or below the domain", () => {
    for (const name of ["@", "ns1", "a.b", "example.de.", "ns1.Example.DE.", "_dmarc", "*"]) expect(ownerNameProblem(name, "example.de")).toBeUndefined();
  });

  it("refuses absolute names outside the domain, empty and non-DNS names, and U-labels", () => {
    expect(ownerNameProblem("ns1.other.de.", "example.de")).toMatch(/example\.de\./);
    expect(ownerNameProblem("badexample.de.", "example.de")).toBeDefined();
    expect(ownerNameProblem(" ", "example.de")).toBeDefined();
    expect(ownerNameProblem("a b", "example.de")).toBeDefined();
    expect(ownerNameProblem("bücher", "example.de")).toMatch(/A-label/);
  });

  it("does not check absolute names when the domain is not known yet", () => {
    expect(ownerNameProblem("ns1.other.de.", "")).toBeUndefined();
  });
});

describe("record problems", () => {
  it("checks the address against the type", () => {
    expect(recordProblems({ type: "a", name: "ns1", address: "192.0.2.1" }, "example.de")).toEqual({});
    expect(recordProblems({ type: "a", name: "ns1", address: "2001:db8::1" }, "example.de")).toEqual({ address: "Enter an IPv4 address" });
    expect(recordProblems({ type: "aaaa", name: "ns1", address: "192.0.2.1" }, "example.de")).toEqual({ address: "Enter an IPv6 address" });
  });

  it("checks host names and MX preferences", () => {
    expect(recordProblems({ type: "ns", name: "@", nsdname: "ns1.example.net." }, "example.de")).toEqual({});
    expect(recordProblems({ type: "ns", name: "@", nsdname: "-bad.example" }, "example.de")).toHaveProperty("nsdname");
    expect(recordProblems({ type: "mx", name: "@", preference: "65536", exchange: "" }, "example.de")).toEqual({
      preference: "Use a whole number from 0 to 65535",
      exchange: "Enter a host name",
    });
    expect(recordProblems({ type: "mx", name: "@", preference: "0", exchange: "mx.example.net" }, "example.de")).toEqual({});
  });
});

describe("MX with the root as exchange", () => {
  it("accepts and sends 0 . as typed", () => {
    const input = { type: "mx" as const, name: "@", preference: "0", exchange: "." };
    expect(recordProblems(input, "example.de")).toEqual({});
    expect(dnsRecordOf(input).rdata).toEqual({ preference: "0", exchange: "." });
    expect(describeRecord(input)).toBe("@ MX 0 .");
    expect(dnsRecordInputOf(dnsRecordOf(input))).toEqual(input);
  });
});
