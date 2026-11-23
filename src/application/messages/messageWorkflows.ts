import type { Message } from "@/rpp/core/types/objects";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { OperationSuccess } from "@/rpp/operations/types";

export interface Signal {
  signal?: AbortSignal;
}

export type MessageWorkflows = ReturnType<typeof createMessageWorkflows>;

/** The registrar workflows on the message queue, as use cases over the protocol client. */
export function createMessageWorkflows(client: RppClient) {
  const { messages } = client;
  return {
    /**
     * Retrieves messages, of the given types or of any. Every message returned becomes delivered at the registry, and is
     * returned again until it is acknowledged. A server may answer with many messages.
     */
    async retrieve(types: readonly string[] = [], options: Signal = {}): Promise<OperationSuccess<Message[]>> {
      return messages.query({ signal: options.signal, ...(types.length > 0 && { types }) });
    },

    /** Tells the registry the message was processed, which removes it from the queue. */
    async acknowledge(id: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
      return messages.acknowledge(id, options);
    },
  };
}
