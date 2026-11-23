import type { Message } from "../core/types/objects";
import { isJsonObject } from "../core/types/json";
import { perform, type OperationContext } from "./context";
import { segment } from "./paths";
import type { CallOptions, OperationSuccess } from "./types";

export interface MessageOperations {
  /**
   * Retrieves queued messages (core §16.10.1). Each message returned becomes `delivered` and must be acknowledged,
   * or it is returned again; processing must be idempotent.
   */
  query(options?: CallOptions & { types?: readonly string[] }): Promise<OperationSuccess<Message[]>>;
  read(id: string, options?: CallOptions): Promise<OperationSuccess<Message>>;
  /** Acknowledges a message with DELETE; the server sends no content (core §16.10.2). */
  acknowledge(id: string, options?: CallOptions): Promise<OperationSuccess<unknown>>;
  create(body: unknown, options?: CallOptions): Promise<OperationSuccess<Message>>;
}

export function createMessageOperations(context: OperationContext): MessageOperations {
  const target = (id: string) => `messages/${segment(id, "message identifier")}`;
  return {
    async query(options) {
      const result = await perform(context, {
        method: "GET",
        target: "messages",
        query: options?.types ? { type: options.types } : undefined,
        options,
        responseDefinition: "message.query",
      });
      // The draft once said a query returns one message; a server may still answer with a lone message, or with many.
      const lone = isJsonObject(result.data) && result.data["@type"] === "message";
      const warnings = result.data === undefined || lone || Array.isArray(result.data) ? [] : ["The response is not a list of messages."];
      return {
        data: (lone ? [result.data] : (result.data ?? [])) as Message[],
        meta: warnings.length > 0 ? { ...result.meta, warnings: [...result.meta.warnings, ...warnings] } : result.meta,
      };
    },
    read: async (id, options) =>
      (await perform(context, { method: "GET", target: target(id), options, responseDefinition: "message.read" })) as OperationSuccess<Message>,
    acknowledge: async (id, options) => perform(context, { method: "DELETE", target: target(id), options }),
    create: async (body, options) =>
      (await perform(context, {
        method: "POST",
        target: "messages",
        body,
        options,
        requestDefinition: "message.create",
        responseDefinition: "message.read",
      })) as OperationSuccess<Message>,
  };
}
