import type { DiscoveryError } from "../errors/DiscoveryError";
import type { Correlation } from "../client/response";

/** An identifier and exact version, as presets, profiles and extensions refer to each other. */
export interface VersionedReference {
  id: string;
  version: string;
}

/** An extension as the server advertises it (Extension Object). */
export interface ServerExtension extends VersionedReference {
  name: string | undefined;
  url: string | undefined;
}

export interface ServerVersion {
  version: string;
  /** As published; server-provided and untrusted until it passes the origin policy of a transport. */
  baseUrl: string;
}

export interface PresetCapability extends VersionedReference {
  name: string | undefined;
  description: string | undefined;
  rppVersion: string | undefined;
  url: string | undefined;
  /** Flattened: includes the extensions of the base presets. */
  extensions: ServerExtension[];
  profiles: VersionedReference[];
  boundProfiles: VersionedReference[];
  basePresets: VersionedReference[];
  isDefault: boolean;
}

export interface CapabilitySnapshot {
  source: {
    /** The discovery document URL that was requested. */
    url: string;
    /** ISO 8601, client clock. */
    retrievedAt: string;
    /** Id of the diagnostics record of the request. */
    exchangeId: string;
    correlation: Correlation;
  };
  versions: ServerVersion[];
  environment: { name: string; status: string } | undefined;
  tlds: string[];
  /** Object types the server manages, such as `domainName`. */
  objects: string[];
  /** The `extensions` list of the document; see `advertisedExtensions` for the union with those of the presets. */
  extensions: ServerExtension[];
  presets: PresetCapability[];
  profiles: VersionedReference[];
  /** The `datetime` of the document, server clock. */
  serverDatetime: string | undefined;
  /** The document as received, including members this client does not model (links, idnLgr, notices, ...). */
  raw: unknown;
}

export type DiscoveryState =
  | { status: "not-started" }
  | { status: "loading" }
  | { status: "ready"; snapshot: CapabilitySnapshot }
  | { status: "partial"; snapshot: CapabilitySnapshot; warnings: string[] }
  | { status: "failed"; error: DiscoveryError };
