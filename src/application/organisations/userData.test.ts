import { describe, expect, it } from "vitest";
import type { User } from "@/rpp/core/types/objects";
import { RppError } from "@/rpp/errors/RppError";
import { buildUserPatch, createBody, describeUserOperation, EMPTY_USER, parseUserId, userEditOf, type UserData } from "./userData";

const USER = {
  "@type": "user",
  id: "U-1",
  details: { "@type": "Card", version: "2.0", name: { full: "Jane Doe" }, emails: { email: { address: "jane@example.test" } } },
  description: "Administrator",
  status: { "@type": "userStatus", label: "active" },
  organisation: { "@type": "organisation", id: "ORG-1" },
} as unknown as User;

const edit = (overrides: Partial<UserData> = {}): UserData => ({ ...userEditOf(USER), ...overrides });

describe("user identifier", () => {
  it("loses its surrounding whitespace and must not be empty", () => {
    expect(parseUserId(" U-1 ")).toBe("U-1");
    expect(() => parseUserId("")).toThrow(RppError);
  });
});

describe("userEditOf", () => {
  it("reads the details, the description and a status a client may set", () => {
    expect(userEditOf(USER)).toEqual({ card: { name: "Jane Doe", email: "jane@example.test", voice: "" }, description: "Administrator", status: "" });
    expect(userEditOf({ ...USER, status: { "@type": "userStatus", label: "suspended" } } as unknown as User).status).toBe("suspended");
  });
});

describe("createBody", () => {
  it("sends the identifier and the details, and only what else was filled in", () => {
    expect(createBody({ id: " U-2 ", data: { ...EMPTY_USER, card: { name: "John", email: "", voice: "" } } })).toEqual({
      "@type": "user",
      id: "U-2",
      details: { "@type": "Card", version: "2.0", name: { full: "John" } },
    });
    expect(createBody({ id: "U-2", data: { card: { name: "", email: "j@example.test", voice: "" }, description: " Operator ", status: "suspended" } })).toEqual({
      "@type": "user",
      id: "U-2",
      details: { "@type": "Card", version: "2.0", emails: { email: { address: "j@example.test" } } },
      description: "Operator",
      status: { "@type": "userStatus", label: "suspended" },
    });
  });

  it("is refused without an identifier, or with a status a client cannot set", () => {
    expect(() => createBody({ id: " ", data: EMPTY_USER })).toThrow(RppError);
    expect(() => createBody({ id: "U-2", data: { ...EMPTY_USER, status: "active" } })).toThrow(RppError);
  });
});

describe("buildUserPatch", () => {
  it("has no operations when nothing changed", () => {
    expect(buildUserPatch(USER, edit())).toEqual([]);
  });

  it("changes the details below /details and the description", () => {
    expect(buildUserPatch(USER, edit({ card: { name: "Janet", email: "jane@example.test", voice: "" }, description: "Operator" }))).toEqual([
      { op: "replace", path: "/details/name/full", value: "Janet" },
      { op: "replace", path: "/description", value: "Operator" },
    ]);
  });

  it("adds and removes the description", () => {
    expect(buildUserPatch(USER, edit({ description: "" }))).toEqual([{ op: "remove", path: "/description" }]);
    const bare = { ...USER, description: undefined } as User;
    expect(buildUserPatch(bare, { ...userEditOf(bare), description: "New" })).toEqual([{ op: "add", path: "/description", value: "New" }]);
  });

  it("sets a status the client may set, and leaves the status alone when empty", () => {
    expect(buildUserPatch(USER, edit({ status: "deactivated" }))).toEqual([{ op: "replace", path: "/status", value: { "@type": "userStatus", label: "deactivated" } }]);
    expect(buildUserPatch({ ...USER, status: { "@type": "userStatus", label: "suspended" } } as unknown as User, edit({ status: "" }))).toEqual([]);
    expect(buildUserPatch({ ...USER, status: { "@type": "userStatus", label: "suspended" } } as unknown as User, edit({ status: "suspended" }))).toEqual([]);
  });
});

describe("describeUserOperation", () => {
  it("says in words what an operation does", () => {
    const patch = buildUserPatch(USER, edit({ card: { name: "", email: "x@example.test", voice: "+31.2" }, description: "", status: "suspended" }));
    expect(patch.map(describeUserOperation)).toEqual([
      "Remove the name",
      "Change the email address",
      "Add the phone number",
      "Remove the description",
      "Set the status to suspended",
    ]);
  });
});
