import type { ReactNode } from "react";
import { FailureView } from "@/components/protocol/FailureView";
import { ResultCodeChip } from "@/components/protocol/protocol-badges";
import { RequestProgress } from "@/components/protocol/RequestProgress";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { ResponseMeta } from "@/rpp/operations/types";
import type { Operation } from "./useOperation";

function Meta({ meta }: { meta: ResponseMeta }) {
  const invalid = meta.validation.response?.status === "invalid" ? meta.validation.response : undefined;
  const pending = meta.status === 202 || meta.resultCode?.raw === "01001";
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {meta.resultCode && <ResultCodeChip code={meta.resultCode.raw} />}
        <Badge tone="neutral">HTTP {meta.status}</Badge>
        {meta.correlation.serverTransactionId && (
          <span>
            RPP-Svtrid <code>{meta.correlation.serverTransactionId}</code>
          </span>
        )}
        <span>
          Exchange <code>{meta.exchangeId}</code>
        </span>
        {meta.queueSize !== undefined && <span>{meta.queueSize} message(s) waiting</span>}
      </p>
      {pending && (
        <Callout tone="warning" title="The registry has not finished">
          It accepted the request and will complete it later. Look the domain up again to see where it stands.
        </Callout>
      )}
      {meta.processes.length > 0 && (
        <p className="text-sm">
          Processes started:{" "}
          {meta.processes.map((process) => (
            <code key={process.url} className="mr-2">
              {process.process}
              {process.processId ? ` ${process.processId}` : ""}
            </code>
          ))}
        </p>
      )}
      {meta.warnings.length > 0 && (
        <Callout tone="warning" title="The answer deviates from the specification">
          <ul className="list-disc pl-5">
            {meta.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}
      {invalid && (
        <Callout tone="warning" title="The answer does not match the schema">
          <ul className="list-disc pl-5">
            {invalid.issues.slice(0, 6).map((issue, index) => (
              <li key={index}>
                <code>{issue.instancePath || "/"}</code> {issue.message}
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}

/**
 * Where an operation shows itself: the progress of its requests while it runs, then why it failed or what it
 * achieved with the registry's own result code and ids. `children` shows the data of a success.
 */
export function OperationOutcome<Variables, Data>({
  operation,
  success,
  children,
}: {
  operation: Operation<Variables, Data>;
  /** One sentence, in the tense of a thing that is done. */
  success: string;
  children?: (data: Data) => ReactNode;
}) {
  const { activity, pending, failure, cancelled, result } = operation;
  if (!pending && !activity && !failure && !cancelled && !result) return null;

  return (
    <div className="flex flex-col gap-4">
      <RequestProgress activity={activity} pending={pending} onCancel={operation.cancel} />
      {cancelled && (
        <Callout tone="info" title="You stopped waiting">
          The registry may still have carried out the request. Look the domain up before you try again.
        </Callout>
      )}
      {failure && <FailureView failure={failure} />}
      {result && !pending && !failure && (
        <>
          <Callout tone="success" title={success} />
          <Meta meta={result.meta} />
          {result.data !== undefined && children?.(result.data)}
        </>
      )}
    </div>
  );
}
