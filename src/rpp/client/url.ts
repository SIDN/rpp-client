import { TransportError } from "../errors/TransportError";

export interface OriginPolicy {
  /** Base URL with a trailing slash in its path and without query or hash. */
  readonly base: URL;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowInsecureHttp: boolean;
}

export function createOriginPolicy(config: {
  baseUrl: string;
  allowedOrigins?: readonly string[];
  allowInsecureHttp?: boolean;
}): OriginPolicy {
  let base: URL;
  try {
    base = new URL(config.baseUrl);
  } catch (cause) {
    throw new TransportError("configuration", `Base URL is not a valid absolute URL: ${config.baseUrl}`, { cause });
  }
  base.search = "";
  base.hash = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";

  const allowedOrigins = new Set([base.origin]);
  for (const origin of config.allowedOrigins ?? []) {
    try {
      allowedOrigins.add(new URL(origin).origin);
    } catch (cause) {
      throw new TransportError("configuration", `Allowed origin is not a valid URL: ${origin}`, { cause });
    }
  }
  const policy = { base, allowedOrigins, allowInsecureHttp: config.allowInsecureHttp ?? false };
  assertAllowed(policy, base);
  return policy;
}

/** Throws unless the URL may be requested: https (http only in explicit development mode), no userinfo, allowed origin. */
export function assertAllowed(policy: OriginPolicy, url: URL): void {
  const secure = url.protocol === "https:" || (url.protocol === "http:" && policy.allowInsecureHttp);
  if (!secure) {
    throw new TransportError(
      "origin-not-allowed",
      url.protocol === "http:"
        ? "Plain HTTP is only allowed with an explicit insecure development configuration"
        : `Unsupported URL scheme: ${url.protocol}`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new TransportError("origin-not-allowed", "URLs with embedded credentials are not allowed");
  }
  if (!policy.allowedOrigins.has(url.origin)) {
    throw new TransportError("origin-not-allowed", `Origin is not allowed: ${url.origin}`);
  }
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Resolves a target against the base URL. Relative targets stay below the base path. Does not check the origin. */
export function resolveTarget(policy: OriginPolicy, target: string): URL {
  if (CONTROL_CHARACTERS.test(target)) {
    throw new TransportError("invalid-request", "Target contains control characters");
  }
  try {
    if (SCHEME.test(target) || target.startsWith("//")) return new URL(target, policy.base);
    const url = new URL(target.replace(/^\/+/, ""), policy.base);
    if (!url.pathname.startsWith(policy.base.pathname)) {
      throw new TransportError("invalid-request", "Relative target escapes the base path");
    }
    return url;
  } catch (error) {
    if (error instanceof TransportError) throw error;
    throw new TransportError("invalid-request", `Target is not a valid URL: ${target}`, { cause: error });
  }
}
