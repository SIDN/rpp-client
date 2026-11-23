import { describe, expect, it } from "vitest";
import { branchIds, buildSchemaTree, filterTree } from "./schemaTree";

const DOCUMENT = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://rpp.example.test/rpp/presets/p/schema",
  "rpp:preset": { id: "p", version: "1.0" },
  $defs: {
    Card: {
      type: "object",
      description: "A contact card",
      properties: {
        name: { $ref: "#/$defs/Name" },
        kind: { type: "string", enum: ["individual", "org"] },
        email: { type: "string", format: "email", minLength: 3 },
      },
      required: ["name"],
    },
    Name: { type: "object", properties: { full: { type: "string" } } },
    "contact.create": { allOf: [{ $ref: "#/$defs/Card" }, { $ref: "#/$defs/profile.contact" }], unevaluatedProperties: false },
    "profile.contact": { properties: { authInfo: false }, required: ["emails"] },
    "a/b": { type: "string" },
  },
};

const tree = () => buildSchemaTree(DOCUMENT);

describe("schema tree", () => {
  it("has a node for each definition, in the order of the document, and says what the document is", () => {
    const { nodes, about } = tree();
    expect(nodes.map((node) => node.label)).toEqual(["Card", "Name", "contact.create", "profile.contact", "a/b"]);
    expect(nodes.every((node) => node.kind === "definition")).toBe(true);
    expect(about).toEqual({ id: "https://rpp.example.test/rpp/presets/p/schema", schema: "https://json-schema.org/draft/2020-12/schema", preset: "p 1.0" });
  });

  it("describes properties with their type, requirement, reference and constraints", () => {
    const card = tree().nodes[0]!;
    expect(card).toMatchObject({ summary: "object", description: "A contact card" });
    const [name, kind, email] = card.children;
    expect(name).toMatchObject({ label: "name", kind: "property", required: true, summary: "→ Name", ref: "/$defs/Name" });
    expect(kind).toMatchObject({ label: "kind", required: false, summary: "string", facts: ["enum individual | org"] });
    expect(email?.facts).toEqual(["format email", "minLength 3"]);
  });

  it("shows composition as a keyword node with a branch for each schema, and what a schema requires of members it does not declare", () => {
    const [, , contact, profile] = tree().nodes;
    expect(contact?.facts).toEqual(["unevaluatedProperties false"]);
    expect(contact?.children).toHaveLength(1);
    expect(contact?.children[0]).toMatchObject({ label: "allOf", kind: "keyword", summary: "2 schemas" });
    expect(contact?.children[0]?.children.map((branch) => [branch.label, branch.summary, branch.ref])).toEqual([
      ["[0]", "→ Card", "/$defs/Card"],
      ["[1]", "→ profile.contact", "/$defs/profile.contact"],
    ]);
    expect(profile?.facts).toEqual(["requires emails"]);
    expect(profile?.children[0]).toMatchObject({ label: "authInfo", summary: "not allowed" });
  });

  it("gives every node a unique pointer, escaping what a pointer cannot hold, and knows the parent of each", () => {
    const { index, nodes } = tree();
    expect(nodes[4]?.id).toBe("/$defs/a~1b");
    expect(index.get("/$defs/Card/properties/name")?.parent).toBe("/$defs/Card");
    expect(index.get("/$defs/Card")?.parent).toBeUndefined();
    expect(index.size).toBe(new Set([...index.keys()]).size);
    expect(index.has("/$defs/contact.create/allOf/1")).toBe(true);
  });

  it("copes with a document that is not a schema", () => {
    expect(buildSchemaTree("x")).toMatchObject({ nodes: [], about: {} });
    expect(buildSchemaTree({ $defs: { a: 5, b: true } }).nodes.map((node) => node.summary)).toEqual(["5", "any value"]);
  });
});

describe("filtering the tree", () => {
  it("keeps everything for an empty query", () => {
    const result = filterTree(tree().nodes, "  ");
    expect(result.nodes).toHaveLength(5);
    expect(result.open.size).toBe(0);
  });

  it("keeps matches and what leads to them, and opens what leads to a match", () => {
    const result = filterTree(tree().nodes, "EMAIL");
    expect(result.nodes.map((node) => node.label)).toEqual(["Card", "profile.contact"]);
    expect(result.nodes[0]?.children.map((child) => child.label)).toEqual(["email"]);
    expect([...result.open]).toEqual(["/$defs/Card"]);
    expect(result.matches).toBe(2);
  });

  it("keeps all the children of a node that matches by itself", () => {
    const result = filterTree(tree().nodes, "contact card");
    expect(result.nodes.map((node) => node.label)).toEqual(["Card"]);
    expect(result.nodes[0]?.children).toHaveLength(3);
    expect(result.open.size).toBe(0);
  });

  it("finds nothing when nothing matches", () => {
    expect(filterTree(tree().nodes, "zzz")).toEqual({ nodes: [], open: new Set(), matches: 0 });
  });

  it("lists the nodes that can be opened", () => {
    expect(branchIds(tree().nodes)).toEqual(["/$defs/Card", "/$defs/Name", "/$defs/contact.create", "/$defs/contact.create/allOf", "/$defs/profile.contact"]);
  });
});
