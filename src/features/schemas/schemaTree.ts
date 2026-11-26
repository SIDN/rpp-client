import { isJsonObject } from "@/rpp/core/types/json";
import { t } from "@/i18n";

/** One schema, or one part of a schema, as a node of the tree that a person walks through. */
export interface SchemaNode {
  /** The JSON Pointer of the node in the document, so unique; `$ref` targets are found by it. */
  id: string;
  /** A definition, a property, a keyword such as `allOf` or `items`, or a branch of one. */
  kind: "definition" | "property" | "keyword" | "branch";
  label: string;
  /** What it is in a few words: its type, where a `$ref` points, or that anything or nothing is allowed. */
  summary: string;
  /** The `id` of the node a `$ref` points to in this document, if it does. */
  ref?: string;
  /** Named by `required` of the schema it is a property of. */
  required: boolean;
  /** The constraints of the node itself: `minLength 3`, `enum a | b`, `required x, y`. */
  facts: string[];
  description?: string;
  children: SchemaNode[];
}

export interface SchemaTree {
  nodes: SchemaNode[];
  /** What the document says about itself. */
  about: { id?: string; schema?: string; preset?: string };
  /** Every node by `id`, and the `id` of the parent of each. */
  index: ReadonlyMap<string, { node: SchemaNode; parent: string | undefined }>;
}

const escapePointer = (name: string) => name.replaceAll("~", "~0").replaceAll("/", "~1");
const unescapePointer = (name: string) => name.replaceAll("~1", "/").replaceAll("~0", "~");

const SCALAR_FACTS = [
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "minContains",
  "maxContains",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
] as const;

const SINGLE_KEYWORDS = ["items", "contains", "not", "if", "then", "else", "propertyNames", "additionalProperties", "unevaluatedProperties", "unevaluatedItems", "contentSchema"] as const;
const LIST_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;
const ENUM_SHOWN = 8;

const show = (value: unknown): string => (typeof value === "string" ? value : (JSON.stringify(value) ?? String(value)));

function typeOf(schema: Record<string, unknown>): string {
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.type)) return schema.type.map(show).join(" | ");
  if ("properties" in schema || "patternProperties" in schema) return "object";
  if ("items" in schema || "prefixItems" in schema) return "array";
  return "";
}

function refOf(schema: Record<string, unknown>): { text: string; id: string | undefined } | undefined {
  const ref = schema.$ref;
  if (typeof ref !== "string") return undefined;
  if (!ref.startsWith("#/")) return { text: ref, id: undefined };
  const id = ref.slice(1);
  return { text: unescapePointer(id.slice(id.lastIndexOf("/") + 1)), id };
}

function factsOf(schema: Record<string, unknown>, declared: ReadonlySet<string>): string[] {
  const facts: string[] = [];
  if ("const" in schema) facts.push(`const ${show(schema.const)}`);
  if (Array.isArray(schema.enum)) {
    const shown = schema.enum.slice(0, ENUM_SHOWN).map(show).join(" | ");
    facts.push(`enum ${shown}${schema.enum.length > ENUM_SHOWN ? ` | … (${schema.enum.length} values)` : ""}`);
  }
  for (const key of SCALAR_FACTS) if (key in schema) facts.push(`${key} ${show(schema[key])}`);
  for (const key of SINGLE_KEYWORDS) if (typeof schema[key] === "boolean") facts.push(`${key} ${String(schema[key])}`);
  // A member that a constraint requires but that this schema does not declare is declared elsewhere (a composed branch).
  const required = Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
  const elsewhere = required.filter((name) => !declared.has(name));
  if (elsewhere.length > 0) facts.push(t("schemas.tree.requires", { names: elsewhere.join(", ") }));
  return facts;
}

function describe(schema: unknown, id: string, label: string, kind: SchemaNode["kind"], required: boolean): SchemaNode {
  const base = { id, kind, label, required, facts: [] as string[], children: [] as SchemaNode[] };
  if (typeof schema === "boolean") return { ...base, summary: schema ? t("schemas.tree.anyValue") : t("schemas.tree.notAllowed") };
  if (!isJsonObject(schema)) return { ...base, summary: show(schema) };

  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  const requiredNames = new Set(Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : []);
  const children: SchemaNode[] = [];

  for (const [name, value] of Object.entries(properties)) {
    children.push(describe(value, `${id}/properties/${escapePointer(name)}`, name, "property", requiredNames.has(name)));
  }
  if (isJsonObject(schema.patternProperties)) {
    for (const [pattern, value] of Object.entries(schema.patternProperties)) {
      children.push(describe(value, `${id}/patternProperties/${escapePointer(pattern)}`, `/${pattern}/`, "property", false));
    }
  }
  for (const key of SINGLE_KEYWORDS) {
    if (isJsonObject(schema[key])) children.push(describe(schema[key], `${id}/${key}`, key, "keyword", false));
  }
  for (const key of LIST_KEYWORDS) {
    const list = schema[key];
    if (!Array.isArray(list)) continue;
    children.push({
      id: `${id}/${key}`,
      kind: "keyword",
      label: key,
      summary: t("schemas.tree.schemaCount", { count: list.length }),
      required: false,
      facts: [],
      children: list.map((entry, index) => describe(entry, `${id}/${key}/${index}`, `[${index}]`, "branch", false)),
    });
  }
  if (isJsonObject(schema.dependentSchemas)) {
    for (const [name, value] of Object.entries(schema.dependentSchemas)) {
      children.push(describe(value, `${id}/dependentSchemas/${escapePointer(name)}`, t("schemas.tree.ifName", { name }), "keyword", false));
    }
  }
  for (const key of ["$defs", "definitions"] as const) {
    const defs = schema[key];
    if (!isJsonObject(defs)) continue;
    children.push({
      id: `${id}/${key}`,
      kind: "keyword",
      label: key,
      summary: t("schemas.tree.definitionCount", { count: Object.keys(defs).length }),
      required: false,
      facts: [],
      children: Object.entries(defs).map(([name, value]) => describe(value, `${id}/${key}/${escapePointer(name)}`, name, "definition", false)),
    });
  }

  const ref = refOf(schema);
  const summary = [typeOf(schema), ref ? `→ ${ref.text}` : ""].filter(Boolean).join(" · ") || (children.length === 0 ? t("schemas.tree.anyValue") : "");
  const description = typeof schema.description === "string" ? schema.description : typeof schema.title === "string" ? schema.title : undefined;
  return {
    ...base,
    summary,
    ...(ref?.id !== undefined && { ref: ref.id }),
    facts: factsOf(schema, new Set(Object.keys(properties))),
    ...(description && { description }),
    children,
  };
}

/** The tree of a Preset Schema: one node per definition of `$defs`, each with what it is made of. Nothing is resolved or expanded in place. */
export function buildSchemaTree(document: unknown): SchemaTree {
  const root = isJsonObject(document) ? document : {};
  const defs = isJsonObject(root.$defs) ? root.$defs : {};
  const nodes = Object.entries(defs).map(([name, value]) => describe(value, `/$defs/${escapePointer(name)}`, name, "definition", false));
  const preset = isJsonObject(root["rpp:preset"]) ? root["rpp:preset"] : undefined;

  const index = new Map<string, { node: SchemaNode; parent: string | undefined }>();
  const walk = (node: SchemaNode, parent: string | undefined) => {
    index.set(node.id, { node, parent });
    node.children.forEach((child) => walk(child, node.id));
  };
  nodes.forEach((node) => walk(node, undefined));

  return {
    nodes,
    about: {
      ...(typeof root.$id === "string" && { id: root.$id }),
      ...(typeof root.$schema === "string" && { schema: root.$schema }),
      ...(preset && typeof preset.id === "string" && { preset: `${preset.id}${typeof preset.version === "string" ? ` ${preset.version}` : ""}` }),
    },
    index,
  };
}

const textOf = (node: SchemaNode) => [node.label, node.summary, ...node.facts, node.description ?? ""].join(" ").toLowerCase();

/**
 * The nodes that match the query, or have a descendant that does, and the ones to open to show the matches. A node that
 * matches without a matching descendant keeps all of its children, so that it can be opened to see what it is made of.
 */
export function filterTree(nodes: readonly SchemaNode[], query: string): { nodes: SchemaNode[]; open: Set<string>; matches: number } {
  const needle = query.trim().toLowerCase();
  if (needle === "") return { nodes: [...nodes], open: new Set(), matches: 0 };
  const open = new Set<string>();
  let matches = 0;

  const visit = (node: SchemaNode): SchemaNode | undefined => {
    const kept = node.children.map(visit).filter((child): child is SchemaNode => child !== undefined);
    const self = textOf(node).includes(needle);
    if (self) matches += 1;
    if (kept.length > 0) {
      open.add(node.id);
      return { ...node, children: kept };
    }
    return self ? node : undefined;
  };

  return { nodes: nodes.map(visit).filter((node): node is SchemaNode => node !== undefined), open, matches };
}

/** The ids of every node that has children, for opening all. */
export function branchIds(nodes: readonly SchemaNode[]): string[] {
  return nodes.flatMap((node) => (node.children.length > 0 ? [node.id, ...branchIds(node.children)] : []));
}
