const PREFIX = "rpp-client-";
const FIRST = 10_000_000;
const COUNT = 90_000_000;

function randomBelow(count: number): number {
  const limit = Math.floor(0x1_0000_0000 / count) * count;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while ((buffer[0] ?? 0) >= limit);
  return (buffer[0] ?? 0) % count;
}

/**
 * RPP-Cltrid for requests the client makes by itself: `rpp-client-` and eight random digits. An id is not
 * handed out twice by one generator, because the server treats a repeated one as a repeat of the request.
 */
export function createClientTransactionIdGenerator(random: (count: number) => number = randomBelow): () => string {
  const used = new Set<string>();
  return () => {
    if (used.size >= COUNT) throw new Error("All client transaction ids of this format are used");
    let id: string;
    do {
      id = `${PREFIX}${FIRST + random(COUNT)}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
}
