import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { supportsObject } from "@/rpp/discovery/capabilities";
import type { ResourceType } from "@/rpp/core/types/resources";

/** What is known about a feature of the server, kept apart from what this client implements. */
export type ServerSupport = "offered" | "not-offered" | "unknown";

/** Only a discovery that has been read can confirm or deny; anything else leaves the answer open. */
export function objectSupport(discovery: DiscoveryState, type: ResourceType): ServerSupport {
  if (discovery.status !== "ready" && discovery.status !== "partial") return "unknown";
  return supportsObject(discovery.snapshot, type) ? "offered" : "not-offered";
}
