import { describe, expect, it } from "vitest";
import { cardDataOf } from "./card";
import { applyPatch } from "./applyPatch";
import { createSyntheticUser, synthesizeUsers, SYNTHETIC_USER_COUNT } from "./syntheticUsers";
import { buildUserPatch, userEditOf } from "./userData";

describe("synthesized users", () => {
  it("makes up users of the organisation with random identifiers, the same for the same seed", () => {
    const users = synthesizeUsers("ORG-1", { seed: 7 });
    expect(users).toHaveLength(SYNTHETIC_USER_COUNT);
    expect(new Set(users.map(({ user }) => user.id)).size).toBe(SYNTHETIC_USER_COUNT);
    for (const { user } of users) {
      expect(user.id).toMatch(/^user-\d+$/);
      expect(user.organisation).toEqual({ "@type": "organisation", id: "ORG-1" });
      expect(cardDataOf(user.details).name).not.toBe("");
    }
    expect(synthesizeUsers("ORG-1", { seed: 7 }).map(({ user }) => user.id)).toEqual(users.map(({ user }) => user.id));
    expect(synthesizeUsers("ORG-1", { seed: 8 }).map(({ user }) => user.id)).not.toEqual(users.map(({ user }) => user.id));
  });

  it("shows every status a user can have, and nothing of a registrar", () => {
    const users = synthesizeUsers("ORG-1");
    expect(new Set(users.map(({ user }) => (user.status as { label: string }).label))).toEqual(new Set(["active", "pending", "suspended", "deactivated"]));
    const text = JSON.stringify(users);
    for (const member of ["provMetadata", "spClientId", "crClientId", "upClientId", "\"roles\""]) expect(text).not.toContain(member);
  });

  it("applies the partial update the edit form builds", () => {
    const [first] = synthesizeUsers("ORG-1");
    const user = first!.user;
    const wanted = { ...userEditOf(user), card: { name: "Renamed", email: "", voice: "" }, description: "", status: "suspended" };
    const changed = applyPatch(user, buildUserPatch(user, wanted));
    expect(userEditOf(changed)).toEqual(wanted);
    expect(user.description).not.toBe("");
  });

  it("refuses an update of a member that is not there", () => {
    const [first] = synthesizeUsers("ORG-1");
    expect(() => applyPatch(first!.user, [{ op: "replace", path: "/nothing/here", value: 1 }])).toThrow();
  });

  it("adds a user as active unless a status is chosen, but not one that already exists", () => {
    const users = synthesizeUsers("ORG-1");
    const data = { card: { name: "New", email: "", voice: "" }, description: "", status: "" };
    const created = createSyntheticUser("ORG-1", { id: " user-new ", data }, users);
    expect(created.user).toMatchObject({ id: "user-new", status: { label: "active" }, organisation: { id: "ORG-1" } });
    expect(createSyntheticUser("ORG-1", { id: "x", data: { ...data, status: "suspended" } }, users).user.status).toMatchObject({ label: "suspended" });
    expect(() => createSyntheticUser("ORG-1", { id: users[0]!.user.id, data }, users)).toThrow(/already exists/);
  });
});
