import { describe, expect, it } from "vitest";
import type { Message } from "@/rpp/core/types/objects";
import { asMessages, isKnownType, MESSAGE_TYPES, messageTypeOf, otherTypesIn, typeLabel, viewOf } from "./messages";
import { EXAMPLES_PER_TYPE, isSynthetic, SYNTHETIC_PREFIX, synthesizeMessages } from "./synthesize";

const message = (data: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
  ({ "@type": "message", id: "M-1", creationDate: "2026-01-02T03:04:05Z", status: "delivered", data, ...overrides }) as Message;

describe("message types", () => {
  it("has every type of the data objects draft", () => {
    expect(MESSAGE_TYPES.map((entry) => entry.id)).toEqual([
      "reviewResponseMessage",
      "transferRequestMessage",
      "transferOutcomeMessage",
      "expirationDeletionMessage",
      "autoRenewalMessage",
      "serviceNoticeMessage",
    ]);
    expect(MESSAGE_TYPES.every((entry) => isKnownType(entry.id))).toBe(true);
    expect(isKnownType("somethingNew")).toBe(false);
  });

  it("labels a known type, and shows an unknown one as received", () => {
    expect(typeLabel("transferRequestMessage")).toBe("Transfer request");
    expect(typeLabel("somethingNew")).toBe("somethingNew");
    expect(typeLabel("")).toBe("No type");
  });

  it("finds the types the draft does not define, once each", () => {
    const list = [message({ "@type": "autoRenewalMessage" }), message({ "@type": "x1" }), message({ "@type": "x1" }), message({ "@type": "x2" }), message({})];
    expect(otherTypesIn(list)).toEqual(["x1", "x2"]);
    expect(messageTypeOf(list[0]!)).toBe("autoRenewalMessage");
  });
});

describe("asMessages", () => {
  it("takes a list, and a lone message as a list of one", () => {
    const one = message({ "@type": "serviceNoticeMessage" });
    expect(asMessages([one, one])).toHaveLength(2);
    expect(asMessages(one)).toEqual([one]);
  });

  it("makes nothing of what is not a message", () => {
    expect(asMessages(undefined)).toEqual([]);
    expect(asMessages({ "@type": "domainName" })).toEqual([]);
    expect(asMessages(["x", 3, null])).toEqual([]);
  });
});

describe("viewOf", () => {
  const view = (data: Record<string, unknown>) => viewOf(message({ objectType: "domainName", objectId: "example.test", ...data }));

  it("reads a review response", () => {
    const result = view({
      "@type": "reviewResponseMessage",
      approved: false,
      clientTransactionId: "C-1",
      serverTransactionId: "S-1",
      completionDate: "2026-01-01T00:00:00Z",
      message: "Not good enough",
      process: { "@type": "createProcess", processId: "P-1" },
    });
    expect(result).toMatchObject({ id: "M-1", type: "reviewResponseMessage", typeLabel: "Review response", known: true, status: "delivered", objectId: "example.test", objectType: "domainName" });
    expect(result.summary).toBe("Denied: Not good enough");
    expect(result.fields.map((entry) => entry.term)).toEqual(["Result", "Client transaction ID", "Server transaction ID", "Completed", "Message"]);
    expect(result.fields[0]).toMatchObject({ value: "Denied" });
    expect(result.process).toEqual({ "@type": "createProcess", processId: "P-1" });
    expect(result.others).toEqual([]);
  });

  it("reads a transfer request, a transfer outcome, an expiration deletion, an auto-renewal and a service notice", () => {
    expect(view({ "@type": "transferRequestMessage", status: "pending", requestDate: "2026-01-01T00:00:00Z", actionDate: "2026-01-06T00:00:00Z" })).toMatchObject({
      summary: "Transfer pending, respond before 2026-01-06T00:00:00Z",
      fields: [{ term: "Transfer status" }, { term: "Requested" }, { term: "Respond before" }],
    });
    expect(view({ "@type": "transferOutcomeMessage", trStatus: "serverApproved", requestDate: "a", actionDate: "b", expiryDate: "c" })).toMatchObject({
      summary: "Transfer serverApproved",
      fields: [{ term: "Transfer status" }, { term: "Requested" }, { term: "Resolved" }, { term: "New expiry" }],
    });
    expect(view({ "@type": "expirationDeletionMessage", deletionDate: "2026-02-01T00:00:00Z" })).toMatchObject({
      summary: "Deleted after expiration on 2026-02-01T00:00:00Z",
      fields: [{ term: "Deleted" }],
    });
    expect(view({ "@type": "autoRenewalMessage", renewalDate: "r", expiryDate: "e" })).toMatchObject({ summary: "Renewed automatically, now expires e", fields: [{ term: "Renewed" }, { term: "New expiry" }] });
    expect(viewOf(message({ "@type": "serviceNoticeMessage", message: "Maintenance" }))).toMatchObject({ summary: "Maintenance", objectId: "", fields: [{ term: "Message", value: "Maintenance" }] });
  });

  it("leaves out what a message does not carry, and keeps the members it does not model", () => {
    const result = view({ "@type": "transferRequestMessage", status: "pending", requestDate: "r", surprise: { a: 1 } });
    expect(result.fields.map((entry) => entry.term)).toEqual(["Transfer status", "Requested"]);
    expect(result.others).toEqual([["surprise", { a: 1 }]]);
  });

  it("shows a type it does not know as received", () => {
    const result = view({ "@type": "somethingNewMessage", detail: "x" });
    expect(result).toMatchObject({ known: false, typeLabel: "somethingNewMessage", summary: "Message type not known to this client", fields: [] });
    expect(result.others).toEqual([["detail", "x"]]);
  });

  it("copes with a message that has no data", () => {
    expect(viewOf({ "@type": "message", id: "M-9" } as Message)).toMatchObject({ id: "M-9", type: "", known: false, createdAt: "" });
  });
});

describe("synthesizeMessages", () => {
  const NOW = new Date("2026-06-01T12:00:00Z");

  it("makes two examples of every message type of the draft", () => {
    const messages = synthesizeMessages({ now: NOW });
    expect(messages).toHaveLength(MESSAGE_TYPES.length * EXAMPLES_PER_TYPE);
    for (const { id } of MESSAGE_TYPES) expect(messages.filter((entry) => messageTypeOf(entry) === id)).toHaveLength(2);
  });

  it("marks every one as synthesized, with a unique identifier", () => {
    const messages = synthesizeMessages({ now: NOW });
    expect(messages.every((entry) => String(entry.id).startsWith(SYNTHETIC_PREFIX) && isSynthetic(entry))).toBe(true);
    expect(new Set(messages.map((entry) => entry.id)).size).toBe(messages.length);
    expect(isSynthetic(message({}))).toBe(false);
  });

  it("is oldest first, as a queue is, and the same for the same moment", () => {
    const messages = synthesizeMessages({ now: NOW });
    const dates = messages.map((entry) => String(entry.creationDate));
    expect(dates).toEqual([...dates].sort());
    expect(synthesizeMessages({ now: NOW })).toEqual(messages);
  });

  it("gives every example the fields its type has, so each can be shown whole", () => {
    for (const entry of synthesizeMessages({ now: NOW })) {
      const view = viewOf(entry);
      expect(view.known).toBe(true);
      expect(view.fields.length).toBeGreaterThan(0);
      expect(view.others).toEqual([]);
      expect(entry.status).toBe("delivered");
    }
  });

  it("varies the two examples of a type", () => {
    const outcomes = synthesizeMessages({ now: NOW, types: ["transferOutcomeMessage"] }).map((entry) => (entry.data as { trStatus: string }).trStatus);
    expect(new Set(outcomes).size).toBe(2);
  });

  it("makes only the types asked for", () => {
    const some = synthesizeMessages({ now: NOW, types: ["autoRenewalMessage", "serviceNoticeMessage"] });
    expect(some.map(messageTypeOf).sort()).toEqual(["autoRenewalMessage", "autoRenewalMessage", "serviceNoticeMessage", "serviceNoticeMessage"]);
    expect(synthesizeMessages({ now: NOW, types: ["nothingLikeIt"] })).toEqual([]);
    expect(synthesizeMessages({ now: NOW, types: [] })).toHaveLength(12);
  });
});
