import type { Organisation } from "@/rpp/core/types/objects";
import type { QueryObject, QueryResults } from "@/rpp/query/queryObject";

/** How many child organisations one request asks for; the screen shows this first page and says when there is more. */
export const CHILDREN_LIMIT = 50;

/**
 * The Query Object that finds the organisations whose parent is `parentId`, sorted by identifier. A server offers no
 * list of child organisations: they are found with the optional `query` operation (draft-ietf-rpp-data-objects issue
 * 210), filtering on `parent.id`, an element path this client assumes, as the Search screen does.
 */
export function childrenQuery(parentId: string): QueryObject {
  return {
    filter: { element: "parent.id", op: "eq", value: parentId },
    sort: [{ element: "id", direction: "asc" }],
    limit: CHILDREN_LIMIT,
  };
}

/** The organisations of one page of results, and whether the server has more of them. */
export function childrenOf(results: QueryResults<Organisation>): { organisations: Organisation[]; more: boolean } {
  return { organisations: results.results.filter((entry) => typeof entry.id === "string" && entry.id !== ""), more: results.nextCursor !== undefined };
}
