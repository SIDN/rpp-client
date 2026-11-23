import type { RppTransport } from "../client/RppTransport";
import { DiscoveryError } from "../errors/DiscoveryError";
import { TransportError } from "../errors/TransportError";
import type { DiscoveryState } from "./capability-types";
import { parseDiscoveryDocument } from "./parseDiscoveryDocument";

/** The well-known location is at the origin root, not below the base path. */
const WELL_KNOWN_PATH = "/.well-known/rpp";

export type DiscoveryResult = Extract<DiscoveryState, { status: "ready" | "partial" }>;

export interface DiscoveryService {
  /** Rejects with `DiscoveryError`. Aborts reject with the transport's `aborted` error, unchanged. */
  discover(options?: { signal?: AbortSignal }): Promise<DiscoveryResult>;
}

export function createDiscoveryService(config: {
  transport: RppTransport;
  /** The configured RPP base URL; the discovery URL is derived from its origin. */
  baseUrl: string;
  /** Overrides the derived URL. It still has to pass the transport's origin policy. */
  discoveryUrl?: string;
}): DiscoveryService {
  const discoveryUrl = config.discoveryUrl ?? new URL(WELL_KNOWN_PATH, config.baseUrl).href;

  return {
    async discover({ signal } = {}) {
      const retrievedAt = new Date().toISOString();
      let response;
      try {
        // Discovery precedes the choice of a preset, so none is signalled.
        response = await config.transport.send({ method: "GET", target: discoveryUrl, preset: null, authenticate: false, signal });
      } catch (error) {
        if (error instanceof TransportError && error.kind === "aborted") throw error;
        const exchangeId = error instanceof TransportError ? error.exchange?.id : undefined;
        throw new DiscoveryError("transport", `Discovery request failed: ${(error as Error).message}`, {
          exchangeId,
          cause: error,
        });
      }

      const details = { status: response.status, exchangeId: response.exchangeId };
      if (response.status !== 200) {
        const value = response.body.kind === "json" ? response.body.value : undefined;
        const title = typeof value === "object" && value !== null && "title" in value && typeof value.title === "string" ? `: ${value.title}` : "";
        throw new DiscoveryError("http", `Discovery answered with HTTP status ${response.status}${title}`, details);
      }
      if (response.body.kind !== "json") {
        throw new DiscoveryError("content", `The discovery response body is not usable JSON (${response.body.kind})`, details);
      }

      const { snapshot, warnings } = parseDiscoveryDocument(response.body.value, {
        url: discoveryUrl,
        retrievedAt,
        exchangeId: response.exchangeId,
        correlation: response.correlation,
      });
      return warnings.length === 0 ? { status: "ready", snapshot } : { status: "partial", snapshot, warnings };
    },
  };
}
