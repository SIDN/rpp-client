/** DNS-over-HTTPS endpoint with a JSON API; browsers cannot query DNS directly. */
export const DEFAULT_DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

export const DEFAULT_RPP_PORT = 443;

const HTTPS_RR_TYPE = 65;
const SVCB_PORT_KEY = 3;

export interface PortLookupResult {
  port: number;
  /** The Target of the HTTPS record, when it names another host. */
  target?: string;
  /** Whether the HTTPS record names the port, as opposed to the default being used. */
  portFound: boolean;
  /** `dns` when an HTTPS record named a port or a target, `default` when none did. */
  source: "dns" | "default";
}

interface DohAnswer {
  type?: unknown;
  data?: unknown;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

interface ServiceRecord {
  priority: number;
  /** The TargetName, without the trailing dot; undefined when it is "." (the owner name itself). */
  target: string | undefined;
  port: number | undefined;
}

/** Reads a wire-format domain name; returns it and the offset after it. */
function readName(bytes: Uint8Array, start: number): { name: string; end: number } {
  const labels: string[] = [];
  let offset = start;
  while (offset < bytes.length) {
    const length = bytes[offset] ?? 0;
    offset += 1;
    if (length === 0) break;
    labels.push(String.fromCharCode(...bytes.subarray(offset, offset + length)));
    offset += length;
  }
  return { name: labels.join("."), end: offset };
}

function parseWire(hex: string): ServiceRecord | undefined {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return undefined;
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
  if (bytes.length < 3) return undefined;
  const priority = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  const { name, end } = readName(bytes, 2);
  let offset = end;
  let port: number | undefined;
  while (offset + 4 <= bytes.length) {
    const key = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    offset += 4;
    if (key === SVCB_PORT_KEY && length === 2 && offset + 2 <= bytes.length) {
      port = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    }
    offset += length;
  }
  return { priority, target: name === "" ? undefined : name, port };
}

function parsePresentation(data: string): ServiceRecord | undefined {
  const head = /^\s*(\d+)\s+(\S+)/.exec(data);
  if (!head) return undefined;
  const target = (head[2] ?? "").replace(/\.$/, "");
  const port = /(?:^|\s)port="?(\d+)"?(?:\s|$)/.exec(data);
  return { priority: Number(head[1]), target: target === "" ? undefined : target, port: port ? Number(port[1]) : undefined };
}

function parseRecord(data: string): ServiceRecord | undefined {
  const wire = /^\\#\s+\d+\s+([0-9a-fA-F\s]*)$/.exec(data);
  return wire ? parseWire((wire[1] ?? "").replace(/\s+/g, "")) : parsePresentation(data);
}

/**
 * Looks up the HTTPS record at `_rpp.<host>` and returns the port and the target it names.
 * Without a usable HTTPS record the port is 443. Rejects when the lookup itself fails.
 */
export async function lookupRppPort(
  host: string,
  options: { fetch?: typeof fetch; endpoint?: string; signal?: AbortSignal } = {},
): Promise<PortLookupResult> {
  const doFetch = options.fetch ?? fetch;
  const url = new URL(options.endpoint ?? DEFAULT_DOH_ENDPOINT);
  url.searchParams.set("name", `_rpp.${host.replace(/\.$/, "")}`);
  url.searchParams.set("type", "HTTPS");

  const response = await doFetch(url, {
    headers: { Accept: "application/dns-json" },
    credentials: "omit",
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`The DNS lookup answered with HTTP status ${response.status}`);

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("The DNS lookup did not return a usable answer");
  const { Status: status, Answer: answers } = body as { Status?: unknown; Answer?: unknown };
  if (status === 3) return { port: DEFAULT_RPP_PORT, portFound: false, source: "default" };
  if (status !== 0) throw new Error(`The DNS lookup failed with response code ${String(status)}`);

  const records = (Array.isArray(answers) ? (answers as DohAnswer[]) : [])
    .filter((answer) => answer.type === HTTPS_RR_TYPE && typeof answer.data === "string")
    .map((answer) => parseRecord(answer.data as string))
    // Priority 0 is AliasMode, which carries no port of its own.
    .filter((record): record is ServiceRecord => record !== undefined && record.priority > 0)
    .sort((a, b) => a.priority - b.priority);

  const best = records.find((record) => record.target !== undefined || (record.port !== undefined && isPort(record.port)));
  if (!best) return { port: DEFAULT_RPP_PORT, portFound: false, source: "default" };
  const portFound = best.port !== undefined && isPort(best.port);
  const port = portFound ? (best.port as number) : DEFAULT_RPP_PORT;
  return { port, portFound, ...(best.target !== undefined && { target: best.target }), source: "dns" };
}
