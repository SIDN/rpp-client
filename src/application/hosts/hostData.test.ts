import { describe, expect, it } from "vitest";
import type { Host } from "@/rpp/core/types/objects";
import { addressRecordOf, addressRecordsOf, addressesOf, buildHostPatch, cleanAddresses, describeHostOperation, editOf, ipVersionOf, nsRecordOf, type HostEdit } from "./hostData";

const HOST = {
  "@type": "host",
  hostName: "ns1.example.test",
  provMetadata: { "@type": "provMetadata", spClientId: "REG" },
  status: [
    { "@type": "hostStatus", label: "ok" },
    { "@type": "hostStatus", label: "linked" },
    { "@type": "hostStatus", label: "clientUpdateProhibited" },
  ],
  dns: {
    "@type": "dnsData",
    records: [
      { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.test." } },
      { "@type": "dnsRecord", name: "ns1.example.test.", type: "a", rdata: { address: "192.0.2.1" } },
      { "@type": "dnsRecord", name: "ns1.example.test.", type: "aaaa", rdata: { address: "2001:db8::1" } },
    ],
  },
} as unknown as Host;

const edit = (change: Partial<HostEdit> = {}): HostEdit => ({ ...editOf(HOST), ...change });

describe("IP addresses", () => {
  it("tells IPv4 from IPv6 and refuses what is neither", () => {
    expect(ipVersionOf("192.0.2.1")).toBe(4);
    expect(ipVersionOf(" 0.0.0.0 ")).toBe(4);
    expect(ipVersionOf("2001:db8::1")).toBe(6);
    expect(ipVersionOf("::1")).toBe(6);
    expect(ipVersionOf("::ffff:192.0.2.1")).toBe(6);
    for (const bad of ["", "192.0.2", "192.0.2.256", "192.0.2.01", "1.2.3.4.5", "example.test", "2001:db8::g", "2001:::1", "fe80::1%eth0", "[::1]", "1:2:3:4:5:6:7:8:9"]) {
      expect(ipVersionOf(bad)).toBeUndefined();
    }
  });

  it("are read from the A and AAAA records only, as the server wrote them", () => {
    expect(addressRecordsOf(HOST)).toEqual([
      { type: "a", address: "192.0.2.1" },
      { type: "aaaa", address: "2001:db8::1" },
    ]);
    expect(addressesOf({ ...HOST, dns: undefined } as Host)).toEqual([]);
    const upper = { ...HOST, dns: { "@type": "dnsData", records: [{ "@type": "dnsRecord", name: "x.", type: "A", rdata: { address: "192.0.2.9" } }, { "@type": "dnsRecord", name: "x.", type: "txt", rdata: { txtdata: "hi" } }, { "@type": "dnsRecord", name: "x.", type: "a", rdata: {} }] } } as unknown as Host;
    expect(addressRecordsOf(upper)).toEqual([{ type: "A", address: "192.0.2.9" }]);
  });

  it("are trimmed, without blanks and without repeats", () => {
    expect(cleanAddresses([" 192.0.2.1 ", "", "192.0.2.1", "2001:DB8::1", "2001:db8::1"])).toEqual(["192.0.2.1", "2001:DB8::1"]);
  });

  it("become the records of a host: its own ns record, and glue under its name", () => {
    expect(nsRecordOf("ns1.example.test")).toEqual({ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.test." } });
    expect(addressRecordOf("ns1.example.test", "192.0.2.1")).toEqual({ "@type": "dnsRecord", name: "ns1.example.test.", type: "a", rdata: { address: "192.0.2.1" } });
    expect(addressRecordOf("ns1.example.test", "2001:db8::1")).toMatchObject({ type: "aaaa" });
  });
});

describe("host patch", () => {
  it("asks for nothing when nothing was edited", () => {
    expect(buildHostPatch(HOST, edit())).toEqual([]);
  });

  it("reads what the form starts from: the addresses and the statuses the client sets, not the ones the server sets", () => {
    expect(editOf(HOST)).toEqual({ newName: "", addresses: ["192.0.2.1", "2001:db8::1"], clientStatuses: ["clientUpdateProhibited"] });
  });

  it("adds an address as a record under the name the host has now, and removes one by matching it as it was read", () => {
    expect(buildHostPatch(HOST, edit({ addresses: ["2001:db8::1", "192.0.2.7", "2001:db8::7"] }))).toEqual([
      { op: "remove", path: "/dns/records", match: { type: "a", rdata: { address: "192.0.2.1" } } },
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "ns1.example.test.", type: "a", rdata: { address: "192.0.2.7" } } },
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "ns1.example.test.", type: "aaaa", rdata: { address: "2001:db8::7" } } },
    ]);
  });

  it("removes every address that was taken out, and leaves an address that is typed again alone", () => {
    expect(buildHostPatch(HOST, edit({ addresses: [] })).map((operation) => operation.op)).toEqual(["remove", "remove"]);
    expect(buildHostPatch(HOST, edit({ addresses: [" 192.0.2.1 ", "2001:DB8::1", ""] }))).toEqual([]);
  });

  it("leaves out an address that is not an IP address, for the form to flag", () => {
    expect(buildHostPatch(HOST, edit({ addresses: ["192.0.2.1", "2001:db8::1", "ns2.example.test"] }))).toEqual([]);
  });

  it("renames, in the A-label form, unless the name is the same", () => {
    expect(buildHostPatch(HOST, edit({ newName: " ns9.example.test " }))).toEqual([{ op: "replace", path: "/hostName", value: "ns9.example.test" }]);
    expect(buildHostPatch(HOST, edit({ newName: "NS1.example.test" }))).toEqual([]);
    expect(buildHostPatch(HOST, edit({ newName: "ns.bücher.test" }))).toEqual([{ op: "replace", path: "/hostName", value: "ns.xn--bcher-kva.test" }]);
  });

  it("changes client statuses only", () => {
    expect(buildHostPatch(HOST, edit({ clientStatuses: ["clientDeleteProhibited"] }))).toEqual([
      { op: "remove", path: "/status", match: { label: "clientUpdateProhibited" } },
      { op: "add", path: "/status", value: { "@type": "hostStatus", label: "clientDeleteProhibited" } },
    ]);
  });

  it("describes each operation in words", () => {
    const operations = buildHostPatch(HOST, edit({ newName: "ns9.example.test", addresses: ["2001:db8::1", "192.0.2.7"], clientStatuses: [] }));
    expect(operations.map(describeHostOperation)).toEqual([
      "Rename the host to ns9.example.test",
      "Remove the address 192.0.2.1",
      "Add the address 192.0.2.7",
      "Remove status clientUpdateProhibited",
    ]);
    expect(describeHostOperation({ op: "add", path: "/status", value: { label: "clientDeleteProhibited" } })).toBe("Add status clientDeleteProhibited");
  });
});
