import { t } from "@/i18n";
import { applyPatch, type PatchOperation } from "@/rpp/operations/patch";
import { definitionMembers, hasDefinition, projectToDefinition } from "@/rpp/schemas/projection";

/**
 * Data elements with `onDemand` Visibility (data objects §2.4): an operation's output holds them only when
 * `includeElements` names them (§2.7.3), so the copy a Change screen holds may lack them although the object has them.
 * A full update treats them the same way: one is part of the PUT only when the PUT names it in `includeElements`, and is
 * then set when present and cleared when omitted; without that the server leaves it as it is and it must not be sent.
 * The drafts do not say this for input (§2.4: Visibility "affects operation output only"); it is how the proxy reads
 * them, and the only reading under which a PUT of what was read does not clear the password.
 */
export const ON_DEMAND_MEMBERS = ["authInfo"] as const;

export type FullUpdate =
  | {
      status: "ready";
      /** The update view of the object as it is after the edits: what PUT sends (json §5.1). */
      body: Record<string, unknown>;
      /** JSON Pointers of what the read showed that the update view does not hold (read-only members, server statuses). */
      dropped: string[];
      /** Members of the update view the body does not have; a full update leaves them without a value. */
      cleared: string[];
      /** The `onDemand` members the edits change, which the PUT names in `includeElements` so that they are replaced. */
      includeElements: string[];
    }
  /** The edits cannot be sent as a full update; `reason` says why, for the screen. */
  | { status: "unavailable"; reason: string };

/**
 * The full update that carries the same edits as a partial update: the edits applied to the object as read, then
 * projected onto the update definition of the Preset Schema (`{prefix}.update`, extensions included). Without that
 * definition the client cannot tell read-write members from the others, and offers no full update.
 */
export function fullUpdateOf(
  schema: unknown,
  definition: string,
  current: object,
  operations: readonly PatchOperation[],
): FullUpdate {
  if (schema === undefined) return { status: "unavailable", reason: t("updates.full.noSchema") };
  if (!hasDefinition(schema, definition)) return { status: "unavailable", reason: t("updates.full.noDefinition", { definition }) };
  let edited: object;
  try {
    edited = applyPatch(current, operations, { absentIsRemoved: true });
  } catch (error) {
    return { status: "unavailable", reason: (error as Error).message };
  }
  const { value, dropped } = projectToDefinition(schema, definition, edited as Record<string, unknown>);
  const members = definitionMembers(schema, definition);
  const named = new Set(operations.map((operation) => operation.path.split("/")[1]));
  const onDemand: readonly string[] = ON_DEMAND_MEMBERS.filter((member) => members.includes(member));
  const includeElements = onDemand.filter((member) => named.has(member));
  // An onDemand member the edits leave alone is not part of the PUT; one the read happened to show is not sent either.
  const body = Object.fromEntries(Object.entries(value).filter(([member]) => !onDemand.includes(member) || named.has(member)));
  const cleared = members.filter((member) => member !== "@type" && !onDemand.includes(member) && !(member in body));
  return { status: "ready", body, dropped, cleared, includeElements };
}

/** The options of the PUT of a full update: `includeElements` names the onDemand members it replaces, if any. */
export function fullUpdateOptions<O extends object>(update: { includeElements: readonly string[] }, options: O): O & { includeElements?: readonly string[] } {
  return update.includeElements.length > 0 ? { ...options, includeElements: update.includeElements } : options;
}

/** What a Change screen sends: the operations, or the full update worked out from them. */
export type ObjectUpdate = { mode: "partial"; operations: readonly PatchOperation[] } | { mode: "full"; body: Record<string, unknown>; includeElements: readonly string[] };

