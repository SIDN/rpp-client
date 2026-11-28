export const TRANSFER_CODE_LENGTH = 20;

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
// No quotes, backslash, space or angle brackets, which get mangled when pasted into other systems.
const SPECIAL = "!#$%&()*+-.:;=?@[]^_{}~";
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

/** A uniform index below `limit`, without modulo bias. */
function randomBelow(limit: number): number {
  const range = 0x1_0000_0000;
  const max = range - (range % limit);
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while ((buffer[0] ?? 0) >= max);
  return (buffer[0] ?? 0) % limit;
}

const pick = (alphabet: string) => alphabet.charAt(randomBelow(alphabet.length));

/** A random transfer code with at least one lower case letter, upper case letter, digit and special character. */
export function generateTransferCode(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < TRANSFER_CODE_LENGTH) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join("");
}
