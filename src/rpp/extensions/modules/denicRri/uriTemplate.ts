/**
 * The constraints of the URI Template of a request contact (DENIC RRI extension, §Request Contact Data Object):
 * 8 to 1024 characters, a URI Template of level 1 (RFC 6570 §1.2) with the scheme `http`, `https` or `mailto`, and no
 * variables other than `{Alabel}` and `{Ulabel}` (case-sensitive). JSON Schema can only state the length; the rest
 * "MUST be enforced by implementations" (§JSON Schema). The server and the registry check again; this check only
 * spares a round trip and never changes the value.
 */

export const URI_TEMPLATE_MIN_LENGTH = 8;
export const URI_TEMPLATE_MAX_LENGTH = 1024;
export const URI_TEMPLATE_VARIABLES = ["Alabel", "Ulabel"] as const;
export const URI_TEMPLATE_SCHEMES = ["http", "https", "mailto"] as const;

export type UriTemplateIssue =
  | { code: "too-short"; min: number }
  | { code: "too-long"; max: number }
  /** §Internationalisation Considerations: the template consists of ASCII characters. */
  | { code: "not-ascii" }
  | { code: "scheme"; scheme: string | undefined }
  | { code: "unclosed-expression"; index: number }
  | { code: "stray-brace"; index: number }
  /** An operator or modifier of level 2 and above, such as `{+x}` or `{x*}`, or a list of variables. */
  | { code: "not-level-1"; expression: string }
  | { code: "unknown-variable"; variable: string }
  /** A character RFC 6570 §2.1 does not allow in a literal, or a `%` that does not start a pct-encoded octet. */
  | { code: "invalid-literal"; character: string; index: number };

// RFC 6570 §2.1: CTL, SP, DQUOTE, "'", "%" (aside from pct-encoded), "<", ">", "\", "^", "`", "{", "|", "}" are excluded.
const FORBIDDEN_CHARACTERS = "\"'<>\\^`|";
const isForbiddenLiteral = (character: string) => {
  const code = character.charCodeAt(0);
  return code <= 0x20 || code === 0x7f || FORBIDDEN_CHARACTERS.includes(character);
};
const VARIABLE_NAME = /^[A-Za-z0-9_]+$/;

/** The issues of a template; empty when it meets every constraint this client can check. */
export function checkUriTemplate(template: string): UriTemplateIssue[] {
  const issues: UriTemplateIssue[] = [];
  if (template.length < URI_TEMPLATE_MIN_LENGTH) issues.push({ code: "too-short", min: URI_TEMPLATE_MIN_LENGTH });
  if (template.length > URI_TEMPLATE_MAX_LENGTH) issues.push({ code: "too-long", max: URI_TEMPLATE_MAX_LENGTH });
  if ([...template].some((character) => character.charCodeAt(0) > 0x7f)) issues.push({ code: "not-ascii" });

  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(template)?.[1];
  if (scheme === undefined || !(URI_TEMPLATE_SCHEMES as readonly string[]).includes(scheme.toLowerCase())) {
    issues.push({ code: "scheme", scheme });
  }

  let index = 0;
  while (index < template.length) {
    const character = template.charAt(index);
    if (character === "{") {
      const end = template.indexOf("}", index + 1);
      const nextOpen = template.indexOf("{", index + 1);
      if (end === -1 || (nextOpen !== -1 && nextOpen < end)) {
        issues.push({ code: "unclosed-expression", index });
        index += 1;
        continue;
      }
      const expression = template.slice(index + 1, end);
      if (!VARIABLE_NAME.test(expression)) issues.push({ code: "not-level-1", expression });
      else if (!(URI_TEMPLATE_VARIABLES as readonly string[]).includes(expression)) issues.push({ code: "unknown-variable", variable: expression });
      index = end + 1;
      continue;
    }
    if (character === "}") issues.push({ code: "stray-brace", index });
    else if (character === "%") {
      if (!/^%[0-9A-Fa-f]{2}/.test(template.slice(index, index + 3))) issues.push({ code: "invalid-literal", character, index });
    } else if (isForbiddenLiteral(character)) issues.push({ code: "invalid-literal", character, index });
    index += 1;
  }
  return issues;
}

// RFC 6570 §3.2.2: simple string expansion keeps the unreserved characters and pct-encodes every other octet of UTF-8.
const UNRESERVED = /[A-Za-z0-9\-._~]/;

function encodeSimple(value: string): string {
  let result = "";
  for (const character of value) {
    if (UNRESERVED.test(character)) {
      result += character;
      continue;
    }
    for (const byte of new TextEncoder().encode(character)) result += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return result;
}

/**
 * The template expanded for one domain name, for a preview of what the registry publishes. Level 1 only: an expression
 * this client does not know is left as it is. The registry does not document how it encodes a U-label (§Mapping to
 * DENIC RRI), so the preview follows RFC 6570 §3.2.1.
 */
export function expandUriTemplate(template: string, values: { Alabel: string; Ulabel: string }): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (expression, name: string) =>
    name === "Alabel" || name === "Ulabel" ? encodeSimple(values[name]) : expression,
  );
}
