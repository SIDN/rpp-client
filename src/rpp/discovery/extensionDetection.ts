import type { ServerExtension } from "./capability-types";

/** What the client has implemented for one extension; an extension module declares at least this. */
export interface LocalExtensionSupport {
  id: string;
  /** Exact versions; the drafts match extensions by identifier and exact version. */
  supportedVersions: readonly string[];
}

export type ExtensionAvailability =
  | { status: "available"; advertised: ServerExtension }
  /** The client implements the extension, but not in the version the server advertises. */
  | { status: "version-mismatch"; advertised: ServerExtension; supportedVersions: readonly string[] }
  /** Advertised, but the client has no implementation. Stays visible for diagnostics. */
  | { status: "unrecognized"; advertised: ServerExtension };

export interface ExtensionDetection {
  /** One entry per advertised extension, in the order given. */
  advertised: ExtensionAvailability[];
  /** Implemented locally, but the server advertises no version of it. */
  notAdvertised: LocalExtensionSupport[];
}

/** Classifies advertised extensions against the local implementations. Having code for an extension never makes it available. */
export function detectExtensions(
  advertised: readonly ServerExtension[],
  local: readonly LocalExtensionSupport[],
): ExtensionDetection {
  const localById = new Map(local.map((support) => [support.id, support]));
  return {
    advertised: advertised.map((extension): ExtensionAvailability => {
      const support = localById.get(extension.id);
      if (!support) return { status: "unrecognized", advertised: extension };
      if (support.supportedVersions.includes(extension.version)) return { status: "available", advertised: extension };
      return { status: "version-mismatch", advertised: extension, supportedVersions: support.supportedVersions };
    }),
    notAdvertised: local.filter((support) => !advertised.some((extension) => extension.id === support.id)),
  };
}
