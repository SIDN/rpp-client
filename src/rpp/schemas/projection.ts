import { isJsonObject } from "../core/types/json";

/**
 * Projects a value onto a definition of a schema document: what the definition does not let the value hold is left out,
 * and each part left out is named by its JSON Pointer. It is how a client turns the read view of an object into the
 * update view a full update sends (json §5.1): read-only members (`provMetadata`, `processes`, ...) and array elements
 * the definition does not allow (statuses only the server sets) are not part of it. Nothing is added or changed.
 *
 * Only local references (`#/$defs/...`) are followed, and `allOf` branches are merged. Where the document says nothing
 * about the members of an object (no `properties`, `patternProperties` or `additionalProperties`), or where a value
 * could take one of several shapes (`anyOf`, `oneOf`), the value is kept as it is.
 */
export interface Projection<T = unknown> {
  value: T;
  /** JSON Pointers into the original value. */
  dropped: string[];
}

type Schema = Record<string, unknown>;

interface Collected {
  properties: Map<string, Schema[]>;
  patternProperties: [RegExp, Schema][];
  additionalProperties: Schema | boolean | undefined;
  items: Schema[];
  constants: unknown[][];
  /** Whether anything constrains the members of an object. */
  closedObject: boolean;
  /** A branch of `anyOf`/`oneOf` was met: the value is not projected. */
  ambiguous: boolean;
}

const DEFS = "#/$defs/";
const pointerToken = (key: string) => key.replaceAll("~", "~0").replaceAll("/", "~1");

function resolve(document: Schema, node: unknown, seen: Set<string>): Schema | undefined {
  if (!isJsonObject(node)) return undefined;
  const ref = node.$ref;
  if (typeof ref === "string" && ref.startsWith(DEFS)) {
    if (seen.has(ref)) return undefined;
    seen.add(ref);
    const defs = isJsonObject(document.$defs) ? document.$defs : {};
    const target = resolve(document, defs[ref.slice(DEFS.length).replaceAll("~1", "/").replaceAll("~0", "~")], seen);
    const { $ref: _ref, ...rest } = node;
    void _ref;
    return target && Object.keys(rest).length > 0 ? { allOf: [target, rest] } : target;
  }
  return node;
}

function collect(document: Schema, node: unknown, into: Collected, seen: Set<string>): void {
  const schema = resolve(document, node, new Set(seen));
  if (!schema) return;
  if (isJsonObject(schema.properties)) {
    into.closedObject = true;
    for (const [key, value] of Object.entries(schema.properties)) {
      if (isJsonObject(value)) into.properties.set(key, [...(into.properties.get(key) ?? []), value]);
    }
  }
  if (isJsonObject(schema.patternProperties)) {
    into.closedObject = true;
    for (const [pattern, value] of Object.entries(schema.patternProperties)) {
      try {
        if (isJsonObject(value)) into.patternProperties.push([new RegExp(pattern, "u"), value]);
      } catch {
        into.ambiguous = true;
      }
    }
  }
  if (schema.additionalProperties !== undefined) {
    into.closedObject = true;
    const additional = schema.additionalProperties;
    // Merged over `allOf`: a schema for the other members wins over `true`, and `true` over `false`.
    if (isJsonObject(additional)) into.additionalProperties = additional;
    else if (additional === true && !isJsonObject(into.additionalProperties)) into.additionalProperties = true;
    else if (into.additionalProperties === undefined) into.additionalProperties = false;
  }
  if (isJsonObject(schema.items)) into.items.push(schema.items);
  if ("const" in schema) into.constants.push([schema.const]);
  if (Array.isArray(schema.enum)) into.constants.push(schema.enum);
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) into.ambiguous = true;
  if (Array.isArray(schema.allOf)) for (const branch of schema.allOf) collect(document, branch, into, seen);
}

function collected(document: Schema, schemas: readonly unknown[]): Collected {
  const into: Collected = {
    properties: new Map(),
    patternProperties: [],
    additionalProperties: undefined,
    items: [],
    constants: [],
    closedObject: false,
    ambiguous: false,
  };
  for (const schema of schemas) collect(document, schema, into, new Set());
  return into;
}

const isPrimitive = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

/** Whether a value breaks a `const` or `enum` of the schema, or of one of its primitive members. */
function breaksConstants(document: Schema, schemas: readonly unknown[], value: unknown): boolean {
  const info = collected(document, schemas);
  if (isPrimitive(value)) return info.constants.some((allowed) => !allowed.some((candidate) => candidate === value));
  if (!isJsonObject(value)) return false;
  for (const [key, member] of Object.entries(value)) {
    const memberSchemas = info.properties.get(key);
    if (memberSchemas && isPrimitive(member) && breaksConstants(document, memberSchemas, member)) return true;
  }
  return false;
}

function project(document: Schema, schemas: readonly unknown[], value: unknown, pointer: string, dropped: string[]): unknown {
  const info = collected(document, schemas);
  if (info.ambiguous) return value;
  if (Array.isArray(value)) {
    if (info.items.length === 0) return value;
    const kept: unknown[] = [];
    value.forEach((element, index) => {
      if (breaksConstants(document, info.items, element)) dropped.push(`${pointer}/${index}`);
      else kept.push(project(document, info.items, element, `${pointer}/${index}`, dropped));
    });
    return kept;
  }
  if (!isJsonObject(value) || !info.closedObject) return value;
  const result: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) {
    const at = `${pointer}/${pointerToken(key)}`;
    const declared = info.properties.get(key) ?? info.patternProperties.filter(([pattern]) => pattern.test(key)).map(([, schema]) => schema);
    if (declared.length > 0) result[key] = project(document, declared, member, at, dropped);
    else if (isJsonObject(info.additionalProperties)) result[key] = project(document, [info.additionalProperties], member, at, dropped);
    else if (info.additionalProperties === true) result[key] = member;
    else dropped.push(at);
  }
  return result;
}

const definitionRef = (definition: string) => ({ $ref: `${DEFS}${pointerToken(definition)}` });

export function hasDefinition(document: unknown, definition: string): boolean {
  return isJsonObject(document) && isJsonObject(document.$defs) && Object.hasOwn(document.$defs, definition);
}

/** The value projected onto a definition of the document; see the description of `Projection`. */
export function projectToDefinition<T>(document: unknown, definition: string, value: T): Projection<T> {
  if (!hasDefinition(document, definition)) throw new Error(`The schema has no definition ${definition}`);
  const dropped: string[] = [];
  const projected = project(document as Schema, [definitionRef(definition)], value, "", dropped) as T;
  return { value: projected, dropped };
}

/** The members a definition declares at its top level, its `allOf` branches included. */
export function definitionMembers(document: unknown, definition: string): string[] {
  if (!hasDefinition(document, definition)) return [];
  return [...collected(document as Schema, [definitionRef(definition)]).properties.keys()];
}
