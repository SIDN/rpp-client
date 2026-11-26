import type { LocalExtensionSupport } from "../discovery/extensionDetection";

/**
 * An extension this client implements, compiled in. Bundling a module never activates it: the server has to advertise
 * the extension in a supported version (see `activationOf`). Everything here is data; nothing a server sends is run.
 */
export interface RppExtensionModule extends LocalExtensionSupport {
  /** The protocol identifier of the extension, such as `de.denic.rpp.rri` (extension guidelines §7). */
  readonly id: string;
  /** For display only; the identifier is the key. */
  readonly displayName: string;
  /** Exact versions; the drafts match extensions by identifier and exact version. */
  readonly supportedVersions: readonly string[];
  /** The Data Objects the extension defines, as the `objects` of the Discovery document name them. */
  readonly objects: readonly string[];
  /** The members the extension adds to base objects, by the identifier of the base object. */
  readonly addedMembers: Readonly<Record<string, readonly string[]>>;
  /** The document that defines the extension. */
  readonly specification: string;
  /** The `$id` of the extension's JSON Schema. */
  readonly schemaId: string;
}
