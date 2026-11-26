/** The object types whose objects a screen keeps in the query cache once the server has shown them. */
export type SeenObjectType = "domainName" | "contact" | "host";

/** The first part of the query key of each, followed by the connection number and the identifier. */
export const SEEN_ROOT = { domainName: "domain", contact: "contact", host: "host" } as const satisfies Record<SeenObjectType, string>;

export const seenKey = (type: SeenObjectType, sessionId: number | undefined, id: string) => [SEEN_ROOT[type], sessionId, id] as const;

/**
 * The roots of every query that keeps objects the server has shown, the organisations and users among them. They stay
 * for the whole connection, also while no screen shows them, so that a workflow left and come back to still has them.
 */
export const KEPT_OBJECT_ROOTS = [...Object.values(SEEN_ROOT), "organisation", "user"] as const;
