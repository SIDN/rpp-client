import type { ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { ResultCodeChip } from "@/components/protocol/protocol-badges";
import type { RppFailure } from "@/rpp/errors/RppError";
import { t } from "@/i18n";

function titleFor(failure: RppFailure): string {
  if (failure.kind === "transport" && failure.transportKind === "invalid-request") return t("protocol.failure.notSent");
  switch (failure.kind) {
    case "transport": return t("protocol.failure.transport");
    case "authentication": return t("protocol.failure.authentication");
    case "authorization": return t("protocol.failure.authorization");
    case "rpp-protocol": return t("protocol.failure.protocol");
    case "http": return t("protocol.failure.http");
    case "content": return t("protocol.failure.content");
    case "schema-validation": return t("protocol.failure.schemaValidation");
    case "schema-document": return t("protocol.failure.schemaDocument");
    case "discovery": return t("protocol.failure.discovery");
    case "unknown": return t("protocol.failure.unknown");
  }
}

function hint(failure: RppFailure): string | undefined {
  switch (failure.kind) {
    case "transport":
      if (failure.transportKind === "network") {
        return t("protocol.failure.networkHint");
      }
      if (failure.transportKind === "timeout") return t("protocol.failure.timeoutHint");
      return undefined;
    case "authentication":
      return t("protocol.failure.authenticationHint");
    case "authorization":
      return t("protocol.failure.authorizationHint");
    default:
      return undefined;
  }
}

function Reference({ failure }: { failure: RppFailure }) {
  if (!("exchangeId" in failure) || failure.exchangeId === undefined) return null;
  const correlation = "correlation" in failure ? failure.correlation : undefined;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {"resultCode" in failure && failure.resultCode && <ResultCodeChip code={failure.resultCode.raw} />}
      {correlation?.serverTransactionId && (
        <span>
          RPP-Svtrid <code>{correlation.serverTransactionId}</code>
        </span>
      )}
      <span>
        {t("protocol.exchange.label")} <code>{failure.exchangeId}</code>
      </span>
    </p>
  );
}

function Details({ failure }: { failure: RppFailure }): ReactNode {
  if (failure.kind === "rpp-protocol" || failure.kind === "authentication" || failure.kind === "authorization") {
    const errors = failure.problem?.errors ?? [];
    if (errors.length === 0) return null;
    return (
      <ul className="mt-2 flex flex-col gap-2">
        {errors.map((error, index) => (
          <li key={index} className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <ResultCodeChip code={error.result.raw} />
              <span>{error.reason || error.result.description}</span>
            </span>
            {error.paths.length > 0 && (
              <span className="text-xs">
                {t("protocol.failure.at")} {error.paths.map((path) => <code key={path} className="mr-2">{path}</code>)}
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (failure.kind === "schema-validation") {
    return (
      <ul className="mt-2 flex flex-col gap-1">
        {failure.issues.slice(0, 8).map((issue, index) => (
          <li key={index}>
            <code>{issue.instancePath || "/"}</code> {issue.message}
          </li>
        ))}
        {failure.issues.length > 8 && <li>{t("protocol.failure.more", { count: failure.issues.length - 8 })}</li>}
      </ul>
    );
  }
  if ((failure.kind === "http" || failure.kind === "content") && failure.body.kind !== "empty") {
    return (
      <pre tabIndex={0} aria-label={t("protocol.failure.answerBody")} className="mt-2 max-h-48 overflow-auto rounded-sm bg-surface/60 p-2 font-mono text-xs">
        {failure.body.text.slice(0, 2000)}
      </pre>
    );
  }
  return null;
}

/** What went wrong in words, with the result code, the problem's own reasons and where to find the exchange. */
export function FailureView({ failure }: { failure: RppFailure }) {
  const advice = hint(failure);
  const title = titleFor(failure);
  return (
    <Callout tone="danger" title={title}>
      <p>{failure.message}</p>
      <Details failure={failure} />
      {advice && <p className="mt-2">{advice}</p>}
      <Reference failure={failure} />
    </Callout>
  );
}
