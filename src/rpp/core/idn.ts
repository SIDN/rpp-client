export const isAscii = (value: string): boolean => /^\p{ASCII}*$/u.test(value);

/**
 * The A-label form of a domain or host name (core §16.3), the only form allowed in a URL. ASCII names are returned
 * as they are; a name that cannot be converted gives undefined.
 */
export function toALabel(name: string): string | undefined {
  if (isAscii(name)) return name;
  try {
    return new URL(`https://${name}/`).hostname;
  } catch {
    return undefined;
  }
}
