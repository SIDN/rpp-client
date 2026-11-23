import type { ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { ResultCodeChip } from "@/components/protocol/protocol-badges";
import type { RppFailure } from "@/rpp/errors/RppError";

const TITLES: Record<RppFailure["kind"], string> = {
  transport: "The request did not complete",
  authentication: "The server did not accept the credentials",
  authorization: "This client is not allowed to do that",
  "rpp-protocol": "The registry refused the request",
  http: "The server answered with an error",
  content: "The answer could not be read",
  "schema-validation": "The data does not match the schema",
  "schema-document": "The schema could not be used",
  discovery: "The capabilities could not be read",
  unknown: "Something unexpected went wrong",
};

function hint(failure: RppFailure): string | undefined {
  switch (failure.kind) {
    case "transport":
      if (failure.transportKind === "network") {
        return "Check your network and the server address. A browser also refuses answers from a server that does not allow requests from this page (CORS), which looks the same as being offline.";
      }
      if (failure.transportKind === "timeout") return "The registry did not answer in time. The request may still have been carried out: look the object up before you try again.";
      return undefined;
    case "authentication":
      return "Check the user name and password on the Connection screen.";
    case "authorization":
      return "Only the sponsoring registrar may do this, or the object authorisation information was missing or wrong.";
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
        Exchange <code>{failure.exchangeId}</code>
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
                at {error.paths.map((path) => <code key={path} className="mr-2">{path}</code>)}
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
        {failure.issues.length > 8 && <li>and {failure.issues.length - 8} more</li>}
      </ul>
    );
  }
  if ((failure.kind === "http" || failure.kind === "content") && failure.body.kind !== "empty") {
    return (
      <pre tabIndex={0} aria-label="Body of the answer" className="mt-2 max-h-48 overflow-auto rounded-sm bg-surface/60 p-2 font-mono text-xs">
        {failure.body.text.slice(0, 2000)}
      </pre>
    );
  }
  return null;
}

/** What went wrong in words, with the result code, the problem's own reasons and where to find the exchange. */
export function FailureView({ failure }: { failure: RppFailure }) {
  const advice = hint(failure);
  const title = failure.kind === "transport" && failure.transportKind === "invalid-request" ? "The request was not sent" : TITLES[failure.kind];
  return (
    <Callout tone="danger" title={title}>
      <p>{failure.message}</p>
      <Details failure={failure} />
      {advice && <p className="mt-2">{advice}</p>}
      <Reference failure={failure} />
    </Callout>
  );
}
