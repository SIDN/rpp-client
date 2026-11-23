export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** An omitted array and an empty one are equivalent (json §4.2, §4.3). */
export const listOf = <T>(value: readonly T[] | undefined): readonly T[] => value ?? [];
