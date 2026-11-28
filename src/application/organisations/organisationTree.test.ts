import { describe, expect, it } from "vitest";
import type { Organisation } from "@/rpp/core/types/objects";
import { organisationTree } from "./organisationTree";

const org = (id: string, parent?: string) => ({ "@type": "organisation", id, ...(parent && { parent: { "@type": "organisation", id: parent } }) }) as Organisation;
const shape = (rows: ReturnType<typeof organisationTree>) => rows.map((row) => [row.organisation.id, row.depth, row.attached, row.guides, row.last]);

describe("organisationTree", () => {
  it("puts every organisation directly after its parent, siblings in the given order, with the lines that go on", () => {
    const rows = organisationTree("R", [org("b", "R"), org("a2", "a"), org("a", "R"), org("a1", "a"), org("a11", "a1")]);
    expect(shape(rows)).toEqual([
      ["b", 1, true, [], false],
      ["a", 1, true, [], true],
      ["a2", 2, true, [false], false],
      ["a1", 2, true, [false], true],
      ["a11", 3, true, [false, false], true],
    ]);
    const deep = organisationTree("R", [org("a", "R"), org("a1", "a"), org("a11", "a1"), org("b", "R")]);
    expect(deep.find((row) => row.organisation.id === "a11")?.guides).toEqual([true, false]);
  });

  it("keeps organisations that do not reach the root as detached rows, with what is under them, and survives a circle", () => {
    const rows = organisationTree("R", [org("x", "R"), org("moved", "ORG-5"), org("under-moved", "moved"), org("lone"), org("c1", "c2"), org("c2", "c1"), org("self", "self")]);
    expect(shape(rows)).toEqual([
      ["x", 1, true, [], true],
      ["moved", 1, false, [], true],
      ["under-moved", 2, true, [false], true],
      ["lone", 1, false, [], true],
      ["self", 1, false, [], true],
      ["c1", 1, false, [], true],
      ["c2", 2, true, [false], true],
    ]);
    expect(rows[1]?.parentId).toBe("ORG-5");
  });
});
