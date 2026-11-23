type Schema = Record<string, unknown>;

const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Keywords whose value is a schema, a list of schemas or a map of schemas that the walk enters. `if` and `not` are
// conditions, not what an instance must be: injecting there would change what they match.
const SCHEMA = ["items", "contains", "additionalProperties", "unevaluatedProperties"] as const;
const SCHEMA_LISTS = ["prefixItems"] as const;
const SCHEMA_MAPS = ["properties", "patternProperties", "$defs"] as const;
// A branch is evaluated together with the node that holds the keyword.
const BRANCH = ["then", "else"] as const;
const BRANCH_LISTS = ["allOf", "anyOf", "oneOf"] as const;
const BRANCH_MAPS = ["dependentSchemas"] as const;

const DEFS_PREFIX = "#/$defs/";

/** Definitions that an `allOf` references: they are branches of a composition, not instances of their own. */
function compositionBranches(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((item) => compositionBranches(item, found));
  else if (isSchema(node)) {
    if (Array.isArray(node.allOf)) {
      for (const branch of node.allOf) {
        if (isSchema(branch) && typeof branch.$ref === "string" && branch.$ref.startsWith(DEFS_PREFIX)) {
          found.add(branch.$ref.slice(DEFS_PREFIX.length));
        }
      }
    }
    Object.values(node).forEach((value) => compositionBranches(value, found));
  }
  return found;
}

function inject(node: unknown, root: boolean, branches: ReadonlySet<string>): void {
  if (Array.isArray(node)) return node.forEach((item) => inject(item, true, branches));
  if (!isSchema(node)) return;

  const open = "unevaluatedProperties" in node || "additionalProperties" in node;
  if (root && !open && (node.type === "object" || Array.isArray(node.allOf))) node.unevaluatedProperties = false;

  for (const keyword of SCHEMA) if (isSchema(node[keyword])) inject(node[keyword], true, branches);
  for (const keyword of SCHEMA_LISTS) {
    if (Array.isArray(node[keyword])) node[keyword].forEach((item) => inject(item, true, branches));
  }
  for (const keyword of SCHEMA_MAPS) {
    const map = node[keyword];
    if (!isSchema(map)) continue;
    for (const [name, value] of Object.entries(map)) {
      inject(value, keyword === "$defs" ? !branches.has(name) : true, branches);
    }
  }
  for (const keyword of BRANCH) if (isSchema(node[keyword])) inject(node[keyword], false, branches);
  for (const keyword of BRANCH_LISTS) {
    if (Array.isArray(node[keyword])) node[keyword].forEach((item) => inject(item, false, branches));
  }
  for (const keyword of BRANCH_MAPS) {
    const map = node[keyword];
    if (isSchema(map)) Object.values(map).forEach((value) => inject(value, false, branches));
  }
}

/**
 * json §4.9.1: before validation every object schema gets `unevaluatedProperties: false`, so that a property no schema
 * declares is an error. A node that already says something about undeclared members (`unevaluatedProperties`,
 * `additionalProperties`) is left alone; the holder of an `allOf` gets it so that members of every branch count as
 * evaluated. Works on a copy.
 */
export function enrichWithUnevaluatedProperties<T>(schema: T): T {
  const copy = structuredClone(schema);
  inject(copy, true, compositionBranches(copy));
  return copy;
}
