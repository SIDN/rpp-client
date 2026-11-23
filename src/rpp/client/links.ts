/** A Link header field value is a comma-separated list of `<target>; name=value` entries (RFC 8288). */
export interface LinkValue {
  target: string;
  /** Parameter names are lower-cased; values are unquoted. */
  parameters: Record<string, string>;
}

/** A process created as a side effect of an operation (core §15). */
export interface ProcessLink {
  /** As sent by the server; untrusted until checked against the origin policy of a transport. */
  url: string;
  /** The process object identifier, such as `transferProcess`. */
  process: string;
  processId: string | undefined;
  latest: boolean;
}

export function parseLinkHeader(value: string): LinkValue[] {
  const links: LinkValue[] = [];
  let index = 0;
  const skip = (pattern: RegExp) => {
    while (index < value.length && pattern.test(value[index] ?? "")) index++;
  };

  while (index < value.length) {
    skip(/[\s,]/);
    if (value[index] !== "<") break;
    const end = value.indexOf(">", index);
    if (end < 0) break;
    const target = value.slice(index + 1, end);
    index = end + 1;
    const parameters: Record<string, string> = {};
    for (;;) {
      skip(/\s/);
      if (value[index] !== ";") break;
      index++;
      skip(/\s/);
      const nameStart = index;
      while (index < value.length && !/[=;,\s]/.test(value[index] ?? "")) index++;
      const name = value.slice(nameStart, index).toLowerCase();
      skip(/\s/);
      let parameter = "";
      if (value[index] === "=") {
        index++;
        skip(/\s/);
        if (value[index] === '"') {
          index++;
          while (index < value.length && value[index] !== '"') {
            if (value[index] === "\\") index++;
            parameter += value[index] ?? "";
            index++;
          }
          index++;
        } else {
          const start = index;
          while (index < value.length && !/[;,\s]/.test(value[index] ?? "")) index++;
          parameter = value.slice(start, index);
        }
      }
      if (name && !(name in parameters)) parameters[name] = parameter;
    }
    links.push({ target, parameters });
  }
  return links;
}

/** The `rel="rpp-process"` links of a response; entries without the required `process` attribute are reported, not guessed. */
export function processLinks(headers: Headers): { links: ProcessLink[]; warnings: string[] } {
  const links: ProcessLink[] = [];
  const warnings: string[] = [];
  const header = headers.get("link");
  if (header === null) return { links, warnings };
  for (const link of parseLinkHeader(header)) {
    if (!(link.parameters.rel ?? "").split(/\s+/).includes("rpp-process")) continue;
    const process = link.parameters.process;
    if (!process) {
      warnings.push(`A rpp-process link to ${link.target} has no process attribute (core §15).`);
      continue;
    }
    links.push({
      url: link.target,
      process,
      processId: link.parameters.processid,
      latest: link.parameters.latest === "true",
    });
  }
  return { links, warnings };
}

/** `RPP-Queue-Size`: an integer of at least 0 (core §6.2). */
export function queueSizeOf(headers: Headers): { size: number | undefined; warnings: string[] } {
  const raw = headers.get("rpp-queue-size");
  if (raw === null) return { size: undefined, warnings: [] };
  return /^\d+$/.test(raw.trim())
    ? { size: Number(raw), warnings: [] }
    : { size: undefined, warnings: [`RPP-Queue-Size is not a non-negative integer: ${JSON.stringify(raw)}.`] };
}
