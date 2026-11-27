import type { RppObject } from "@/rpp/core/types/objects";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { CallOptions, OperationSuccess } from "@/rpp/operations/types";
import type { QueryObject, QueryResults } from "@/rpp/query/queryObject";
import type { SearchableObjectType } from "@/rpp/query/searchable";

/** Searches the collection of one object type: a Query Object is never sent to more than one collection. */
export function searchObjects(
  client: RppClient,
  objectType: SearchableObjectType,
  query: QueryObject,
  options?: CallOptions,
): Promise<OperationSuccess<QueryResults<RppObject>>> {
  switch (objectType) {
    case "domainName":
      return client.domains.query(query, options);
    case "contact":
      return client.contacts.query(query, options);
    case "host":
      return client.hosts.query(query, options);
    case "organisation":
      return client.organisations.query(query, options);
  }
}
