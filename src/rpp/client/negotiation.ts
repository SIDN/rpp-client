import { TransportError } from "../errors/TransportError";

export const RPP_MEDIA_TYPE = "application/rpp+json";
export const PROBLEM_MEDIA_TYPE = "application/problem+json";

export const PRESET_HEADER = "RPP-Preset";

/**
 * The preset of a request and how it is signalled (core, preset signalling). The method is a server property:
 * a server supports the `RPP-Preset` header or the `preset` and `preset-version` media type parameters, not both.
 */
export interface PresetSignalling {
  method: "header" | "media-type";
  id: string;
  version: string;
}

export interface MediaType {
  type: string;
  subtype: string;
  parameters: Record<string, string>;
}

export function parseMediaType(value: string): MediaType | undefined {
  const [essence = "", ...rawParameters] = value.split(";");
  const [type, subtype, ...rest] = essence.trim().toLowerCase().split("/");
  if (!type || !subtype || rest.length > 0) return undefined;
  const parameters: Record<string, string> = {};
  for (const raw of rawParameters) {
    const separator = raw.indexOf("=");
    if (separator < 0) continue;
    const name = raw.slice(0, separator).trim().toLowerCase();
    const parameter = raw.slice(separator + 1).trim().replace(/^"(.*)"$/, "$1");
    parameters[name] = parameter;
  }
  return { type, subtype, parameters };
}

export function isJsonMediaType(mediaType: MediaType): boolean {
  return (
    (mediaType.type === "application" || mediaType.type === "text") &&
    (mediaType.subtype === "json" || mediaType.subtype.endsWith("+json"))
  );
}

/** Whether `mediaType` is covered by a list of bare media types or ranges (`*` / `type/*`). */
export function isAcceptedBy(mediaType: MediaType, accepted: readonly string[]): boolean {
  return accepted.some((entry) => {
    const range = parseMediaType(entry);
    if (!range) return false;
    if (range.type === "*") return true;
    if (range.type !== mediaType.type) return false;
    return range.subtype === "*" || range.subtype === mediaType.subtype;
  });
}

// RFC 9651 token, which is what the header method requires of the preset identifier.
const SF_TOKEN = /^[A-Za-z*][A-Za-z0-9!#$%&'*+\-.^_`|~:/]*$/;
// RFC 9651 decimal: at most 12 integer and 3 fractional digits; "1" is an Integer, not a Decimal.
const SF_DECIMAL = /^\d{1,12}\.\d{1,3}$/;

function assertPreset(preset: PresetSignalling): void {
  if (!SF_TOKEN.test(preset.id)) {
    throw new TransportError("invalid-request", `Preset identifier is not a valid token: ${preset.id}`);
  }
  if (!SF_DECIMAL.test(preset.version)) {
    throw new TransportError("invalid-request", `Preset version is not a decimal such as 1.0: ${preset.version}`);
  }
}

function withPresetParameters(mediaType: string, preset: PresetSignalling | undefined): string {
  if (preset?.method !== "media-type") return mediaType;
  return `${mediaType}; preset="${preset.id}"; preset-version="${preset.version}"`;
}

const isRppMediaType = (entry: string) => /^application\/rpp\+/i.test(entry);

export function buildAccept(accept: readonly string[], preset: PresetSignalling | undefined): string {
  if (accept.length === 0) {
    throw new TransportError("invalid-request", "At least one acceptable media type is required");
  }
  for (const entry of accept) {
    if (!parseMediaType(entry) || entry.includes(";")) {
      throw new TransportError("invalid-request", `Accept entries are bare media types or ranges: ${entry}`);
    }
  }
  return accept.map((entry) => (isRppMediaType(entry) ? withPresetParameters(entry, preset) : entry)).join(", ");
}

export function buildContentType(preset: PresetSignalling | undefined): string {
  return withPresetParameters(RPP_MEDIA_TYPE, preset);
}

/** The `RPP-Preset` Dictionary value, or undefined when the preset travels in the media types. */
export function buildPresetHeaderValue(preset: PresetSignalling | undefined): string | undefined {
  if (!preset) return undefined;
  assertPreset(preset);
  return preset.method === "header" ? `preset=${preset.id};version=${preset.version}` : undefined;
}
