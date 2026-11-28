import { describe, expect, it } from "vitest";
import type { Organisation } from "@/rpp/core/types/objects";
import { applyPatch } from "./applyPatch";
import { CHILDREN_LIMIT, childrenOf, childrenQuery } from "./childOrganisations";
import { EMPTY_ORGANISATION, buildOrganisationPatch, organisationEditOf } from "./organisationData";
import { createSyntheticOrganisation, synthesizeChildren, SYNTHETIC_CHILD_COUNT } from "./syntheticOrganisations";

describe("child organisations", () => {
  it("asks for the children of one organisation, in identifier order, one page at most", () => {
    expect(childrenQuery("ORG-1")).toEqual({ filter: { element: "parent.id", op: "eq", value: "ORG-1" }, sort: [{ element: "id", direction: "asc" }], limit: CHILDREN_LIMIT });
  });

  it("says whether the server has more than it returned", () => {
    const results = [{ "@type": "organisation", id: "ORG-2" }] as Organisation[];
    expect(childrenOf({ results })).toEqual({ organisations: results, more: false });
    expect(childrenOf({ results, nextCursor: "c" }).more).toBe(true);
  });
});

describe("synthesized child organisations", () => {
  it("makes up children of the parent with random identifiers, none of them a registrar, the same for the same seed", () => {
    const children = synthesizeChildren("ORG-1", { seed: 3 });
    expect(children).toHaveLength(SYNTHETIC_CHILD_COUNT);
    expect(new Set(children.map((child) => child.id)).size).toBe(SYNTHETIC_CHILD_COUNT);
    for (const child of children) {
      expect(child.id).toMatch(/^org-\d+$/);
      expect(child.parent).toEqual({ "@type": "organisation", id: "ORG-1" });
      expect(Object.keys(child.roles ?? {})).not.toContain("registrar");
      expect(child).not.toHaveProperty("provMetadata");
    }
    expect(synthesizeChildren("ORG-1", { seed: 3 })).toEqual(children);
  });

  it("creates one with an ok status unless chosen, and refuses an identifier in the list", () => {
    const children = synthesizeChildren("ORG-1");
    const data = { ...EMPTY_ORGANISATION, roles: [{ name: "reseller", roleId: "", linkProhibited: false }], parent: "ORG-1" };
    expect(createSyntheticOrganisation({ id: "org-new", data }, children)).toMatchObject({ id: "org-new", parent: { id: "ORG-1" }, status: [{ label: "ok" }] });
    expect(() => createSyntheticOrganisation({ id: children[0]!.id, data }, children)).toThrow(/already/);
  });

  it("takes the patch the edit form sends, so an edit shows in the list", () => {
    const [child] = synthesizeChildren("ORG-1", { seed: 1 });
    const edit = organisationEditOf(child!);
    const changed = { ...edit, parent: "ORG-5", roles: [...edit.roles, { name: "dns-operator", roleId: "", linkProhibited: false }] };
    const patched = applyPatch(child!, buildOrganisationPatch(child!, changed));
    expect(organisationEditOf(patched)).toEqual(organisationEditOf({ ...child!, parent: { "@type": "organisation", id: "ORG-5" }, roles: { ...child!.roles, "dns-operator": { "@type": "organisationRole" } } }));
  });
});
