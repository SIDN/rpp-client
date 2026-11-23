const MODELLED = new Set(["@type", "versions", "environment", "tlds", "presets", "objects", "extensions", "profiles", "datetime"]);

/** Members of the discovery document that this client does not interpret; they stay visible. */
export function unmodelledMembers(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  return Object.keys(raw).filter((key) => !MODELLED.has(key));
}

export const referenceLabel = (reference: { id: string; version: string }) => `${reference.id} ${reference.version}`;

export const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};
