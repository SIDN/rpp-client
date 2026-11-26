import type { ExchangeLog } from "@/rpp/client/diagnostics";
import { createExchangeLog } from "@/rpp/client/diagnostics";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import { createErrorLog, type ErrorLog } from "@/rpp/errors/errorLog";
import { createActivityLog, type ActivityLog } from "@/rpp/client/progress";
import { createQueueMonitor, type QueueMonitor } from "@/rpp/client/queueMonitor";
import { createRppClient, type RppClient } from "@/rpp/operations/RppClient";
import type { RppTransport } from "@/rpp/client/RppTransport";
import type { PresetSignalling } from "@/rpp/client/negotiation";
import type { AuthenticationProvider } from "@/rpp/auth/AuthenticationProvider";
import { basicAuthentication } from "@/rpp/auth/providers/basic";
import { noAuthentication } from "@/rpp/auth/providers/none";
import { createDiscoveryService, type DiscoveryService } from "@/rpp/discovery/DiscoveryService";
import type { ConnectionProfile, Credentials } from "@/config/connectionProfile";
import { t } from "@/i18n";

/** Everything one connection to one server consists of. Dropping the session drops the credentials with it. */
export interface Session {
  /** Distinguishes connections to the same address; safe to use in query keys. */
  id: number;
  profile: ConnectionProfile;
  authentication: AuthenticationProvider;
  transport: RppTransport;
  discovery: DiscoveryService;
  exchanges: ExchangeLog;
  /** The requests that ended in an error, kept when the exchanges are cleared. */
  errors: ErrorLog;
  /** Requests in flight and just finished, for showing progress. */
  activity: ActivityLog;
  /** The number of messages waiting, from the `RPP-Queue-Size` header of the latest response that had one. */
  queue: QueueMonitor;
  /** The protocol operations over the transport. They validate against no schema until one is loaded into the session. */
  client: RppClient;
  /** The preset that operation requests carry from now on; undefined sends none. */
  setPreset(preset: PresetSignalling | undefined): void;
}

let sequence = 0;

export function createSession(
  profile: ConnectionProfile,
  credentials: Credentials | undefined,
  options: { fetch?: typeof fetch; /** Milliseconds to wait for any request; asked for each one. */ timeoutMs?: () => number } = {},
): Session {
  let authentication: AuthenticationProvider;
  if (profile.auth.type === "basic") {
    if (!credentials) throw new TypeError(t("connection.session.basicPasswordRequired"));
    authentication = basicAuthentication({ username: profile.auth.username, password: credentials.password });
  } else {
    authentication = noAuthentication();
  }

  const exchanges = createExchangeLog();
  const errors = createErrorLog();
  const activity = createActivityLog();
  const queue = createQueueMonitor();
  let preset: PresetSignalling | undefined;
  const transport = createFetchTransport({
    baseUrl: profile.baseUrl,
    allowInsecureHttp: profile.allowInsecureHttp,
    authorizationHeaders: (context) => authentication.getAuthorizationHeaders(context),
    onExchange: (record) => {
      exchanges.record(record);
      errors.record(record);
      queue.record(record);
    },
    onProgress: activity.record,
    preset: () => preset,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  });
  return {
    id: ++sequence,
    profile,
    authentication,
    transport,
    discovery: createDiscoveryService({ transport, baseUrl: profile.baseUrl }),
    exchanges,
    errors,
    activity,
    queue,
    client: createRppClient({ transport }),
    setPreset(next) {
      preset = next;
    },
  };
}
