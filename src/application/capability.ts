import type { DiscoveryState, VersionedReference } from "@/rpp/discovery/capability-types";
import { activationOf, type ExtensionActivation } from "@/rpp/extensions/ExtensionRegistry";
import type { RppExtensionModule } from "@/rpp/extensions/ExtensionModule";
import { supportsObject } from "@/rpp/discovery/capabilities";
import type { ResourceType } from "@/rpp/core/types/resources";

/** What is known about a feature of the server, kept apart from what this client implements. */
export type ServerSupport = "offered" | "not-offered" | "unknown";

/** Only a discovery that has been read can confirm or deny; anything else leaves the answer open. */
export function objectSupport(discovery: DiscoveryState, type: ResourceType): ServerSupport {
  if (discovery.status !== "ready" && discovery.status !== "partial") return "unknown";
  return supportsObject(discovery.snapshot, type) ? "offered" : "not-offered";
}

export interface IdnLgr {
  name: string;
  tlds: string[];
  isDefault: boolean;
}

/** The LGRs of the discovery document that apply to the TLD of `name`; empty when the server lists none. */
export function idnLgrsFor(discovery: DiscoveryState, name = ""): IdnLgr[] {
  if (discovery.status !== "ready" && discovery.status !== "partial") return [];
  const raw = discovery.snapshot.raw;
  const list = typeof raw === "object" && raw !== null ? (raw as { idnLgr?: unknown }).idnLgr : undefined;
  if (!Array.isArray(list)) return [];
  const tld = name.trim().replace(/\.$/, "").split(".").pop()?.toLowerCase() ?? "";
  const lgrs: IdnLgr[] = [];
  for (const entry of list as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name: lgrName, tld: tlds, default: isDefault } = entry as { name?: unknown; tld?: unknown; default?: unknown };
    if (typeof lgrName !== "string" || !Array.isArray(tlds)) continue;
    const own = tlds.filter((value): value is string => typeof value === "string");
    if (tld !== "" && !own.some((value) => value.replace(/^\./, "").toLowerCase() === tld)) continue;
    lgrs.push({ name: lgrName, tlds: own, isDefault: isDefault === true });
  }
  return lgrs;
}

/**
 * Whether an extension module may be used: undefined while the discovery document has not been read, which neither
 * confirms nor denies it. `preset` is the preset requests are made under; the server's default when undefined.
 */
export function extensionActivation(
  discovery: DiscoveryState,
  module: RppExtensionModule,
  preset: VersionedReference | undefined,
): ExtensionActivation | undefined {
  if (discovery.status !== "ready" && discovery.status !== "partial") return undefined;
  return activationOf(module, discovery.snapshot, preset);
}

/** What is known about an object type an extension defines: the extension has to be active and the object listed. */
export function extensionObjectSupport(
  discovery: DiscoveryState,
  module: RppExtensionModule,
  type: string,
  preset: VersionedReference | undefined,
): ServerSupport {
  if (discovery.status !== "ready" && discovery.status !== "partial") return "unknown";
  return activationOf(module, discovery.snapshot, preset).status === "active" && supportsObject(discovery.snapshot, type) ? "offered" : "not-offered";
}
