import { isJsonObject } from "@/rpp/core/types/json";
import type { Organisation } from "@/rpp/core/types/objects";

/** One row of the organisation tree, in the order it is drawn: every organisation directly after its parent. */
export interface TreeRow {
  organisation: Organisation;
  /** 1 for a child of the root, 2 for a grandchild, and so on. */
  depth: number;
  /** The `parent.id` of the organisation, as received; absent when it names none. */
  parentId?: string;
  /** False when the parent is neither the root nor in the list, or the parents go round in a circle: drawn at depth 1 on its own. */
  attached: boolean;
  /** For each level above this row (depth − 1 entries): whether that ancestor has a later sibling, so the line on that level goes on. */
  guides: boolean[];
  /** Whether no sibling follows this row. */
  last: boolean;
}

export const parentIdOf = (organisation: Organisation): string | undefined =>
  isJsonObject(organisation.parent) && typeof organisation.parent.id === "string" ? organisation.parent.id : undefined;

/**
 * Orders the organisations as the tree under `rootId` that their `parent` references describe, siblings in the order
 * given. Organisations that do not reach the root (their parent is not listed, or the parents form a circle) follow
 * as detached rows, each with what is listed under it; nothing is dropped.
 */
export function organisationTree(rootId: string, organisations: readonly Organisation[]): TreeRow[] {
  const listed = new Set(organisations.map((organisation) => organisation.id));
  const children = new Map<string, Organisation[]>();
  for (const organisation of organisations) {
    const parent = parentIdOf(organisation);
    if (parent === undefined || parent === organisation.id) continue;
    children.set(parent, [...(children.get(parent) ?? []), organisation]);
  }

  const rows: TreeRow[] = [];
  const visited = new Set<string>();
  const visit = (organisation: Organisation, depth: number, guides: boolean[], last: boolean, attached: boolean) => {
    visited.add(organisation.id);
    rows.push({ organisation, depth, parentId: parentIdOf(organisation), attached, guides, last });
    const below = (children.get(organisation.id) ?? []).filter((child) => !visited.has(child.id));
    below.forEach((child, index) => {
      if (!visited.has(child.id)) visit(child, depth + 1, [...guides, !last], index === below.length - 1, true);
    });
  };

  const top = (children.get(rootId) ?? []).filter((organisation) => organisation.id !== rootId);
  top.forEach((organisation, index) => visit(organisation, 1, [], index === top.length - 1, true));

  // A detached organisation whose parent is listed (a circle) is taken in the given order, like one whose parent is not.
  const detached = (organisation: Organisation) => !visited.has(organisation.id) && organisation.id !== rootId;
  const outside = (organisation: Organisation) => {
    const parent = parentIdOf(organisation);
    return parent === undefined || parent === organisation.id || !listed.has(parent);
  };
  for (const pass of [outside, () => true]) {
    for (const organisation of organisations) if (detached(organisation) && pass(organisation)) visit(organisation, 1, [], true, false);
  }
  return rows;
}
