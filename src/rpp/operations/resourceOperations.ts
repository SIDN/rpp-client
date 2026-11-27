import type { QueryParameters } from "../client/request";
import { classifyResponse, RppError } from "../errors/RppError";
import { parseResultCode, type ParsedResultCode } from "../core/status/resultCodes";
import { objectTypeOf } from "../core/types/resources";
import type { Availability } from "../core/types/objects";
import { parseQueryResults, validateQueryObject, type QueryObject, type QueryResults } from "../query/queryObject";
import { exchange, metaOf, perform, type OperationContext, type OperationSpec } from "./context";
import type { ProcessDefinition, ProcessKind, ProcessOperation, ResourceDefinition } from "./definitions";
import { assertPatch, type PatchOperation } from "./patch";
import { invalidRequest, segment } from "./paths";
import type { AvailabilityResult, CallOptions, OperationSuccess, ProcessSelector } from "./types";

/** Operation parameters (core Rule 7): `includeElements` and those of the object or of an extension. */
export interface ParameterOptions extends CallOptions {
  includeElements?: readonly string[];
  /** Other operation parameters, such as `hostsFilter`; an array is repeated. */
  parameters?: QueryParameters;
}

export interface AvailabilityOptions extends ParameterOptions {
  /** HEAD answers yes or no; GET also returns the Availability Object. Default GET. */
  method?: "GET" | "HEAD";
}

const queryOf = (options: ParameterOptions | undefined): QueryParameters | undefined => {
  if (!options) return undefined;
  const query = { ...options.parameters, ...(options.includeElements && { includeElements: options.includeElements }) };
  return Object.keys(query).length > 0 ? query : undefined;
};

/** The type of an object is part of the contract: a body of another type is reported, not silently accepted. */
function typeWarnings(data: unknown, expected: string | undefined): string[] {
  if (expected === undefined || data === undefined) return [];
  const actual = objectTypeOf(data);
  return actual === expected ? [] : [`The response is ${actual === undefined ? "not an RPP object" : `of type ${actual}`}, expected ${expected}.`];
}

async function performTyped<T>(
  context: OperationContext,
  spec: OperationSpec,
  expectedType: string | undefined,
): Promise<OperationSuccess<T>> {
  const result = await perform(context, spec);
  const warnings = typeWarnings(result.data, expectedType);
  return {
    data: result.data as T,
    meta: warnings.length > 0 ? { ...result.meta, warnings: [...result.meta.warnings, ...warnings] } : result.meta,
  };
}

export interface ProcessOperations<ProcessRead = unknown> {
  readonly kind: ProcessKind;
  readonly definition: ProcessDefinition;
  supports(operation: ProcessOperation): boolean;
  list(owner: string, options?: ParameterOptions): Promise<OperationSuccess<unknown>>;
  /** Starts the process; `body` is the process object, if the process takes input. */
  create(owner: string, body?: unknown, options?: ParameterOptions): Promise<OperationSuccess<ProcessRead>>;
  read(owner: string, selector: ProcessSelector, options?: ParameterOptions): Promise<OperationSuccess<ProcessRead>>;
  /** PUT replaces the process; PATCH takes JSON Patch operations. */
  update(
    owner: string,
    selector: ProcessSelector,
    body: unknown,
    options?: ParameterOptions & { method?: "PUT" | "PATCH" },
  ): Promise<OperationSuccess<ProcessRead>>;
  /** Cancels or removes the process (DELETE, no content). */
  delete(owner: string, selector: ProcessSelector, options?: ParameterOptions): Promise<OperationSuccess<unknown>>;
  approve(owner: string, selector: ProcessSelector, options?: ParameterOptions): Promise<OperationSuccess<unknown>>;
  reject(owner: string, selector: ProcessSelector, body?: unknown, options?: ParameterOptions): Promise<OperationSuccess<unknown>>;
}

export interface ResourceOperations<Read, Create, Update> {
  readonly definition: ResourceDefinition;
  /**
   * Operations return the parsed body typed as the draft's read view. The type is a claim: it holds when
   * `meta.validation.response` is `valid`, and a body of another `@type` adds a warning to `meta.warnings`.
   */
  read(id: string, options?: ParameterOptions): Promise<OperationSuccess<Read>>;
  create(body: Create, options?: ParameterOptions): Promise<OperationSuccess<Read>>;
  /** Full update (PUT): the client sends every read-write member. */
  replace(id: string, body: Update, options?: ParameterOptions): Promise<OperationSuccess<Read>>;
  /** Partial update (PATCH) with JSON Patch operations, atomic on the server (json §5.2). */
  patch(id: string, operations: readonly PatchOperation[], options?: ParameterOptions): Promise<OperationSuccess<Read>>;
  delete(id: string, options?: ParameterOptions): Promise<OperationSuccess<unknown>>;
  /** Whether the object can be provisioned. A 404 here is an answer, not a failure. */
  availability(id: string, options?: AvailabilityOptions): Promise<AvailabilityResult<Availability<string>>>;
  /** The processes of all types of an object (core Rule 6). */
  listProcesses(id: string, options?: ParameterOptions): Promise<OperationSuccess<unknown>>;
  readonly processes: Readonly<Partial<Record<ProcessKind, ProcessOperations>>>;
  /**
   * Searches the collection with a Query Object (`QUERY /{collection}`, draft-ietf-rpp-data-objects issue 210). The
   * operation is optional: a server without it answers 501. Results of another `@type` are kept and reported.
   */
  query(body: QueryObject, options?: CallOptions): Promise<OperationSuccess<QueryResults<Read>>>;
}

/** The warnings of a result envelope: no envelope, or results that are not of the searched type. */
function envelopeWarnings(body: unknown, parsed: QueryResults<unknown> | undefined, expected: string): string[] {
  if (!parsed) return [`The response is not a query result envelope with a results array${body === undefined ? " (no content)" : ""}.`];
  const warnings: string[] = [];
  parsed.results.forEach((result, index) => {
    const actual = objectTypeOf(result);
    if (actual !== expected) {
      warnings.push(`Result ${index} is ${actual === undefined ? "not an RPP object" : `of type ${actual}`}, expected ${expected}.`);
    }
  });
  return warnings;
}

function createProcessOperations(
  context: OperationContext,
  ownerPath: (owner: string) => string,
  kind: ProcessKind,
  definition: ProcessDefinition,
): ProcessOperations {
  const supports = (operation: ProcessOperation) => definition.operations.includes(operation);
  const ensure = (operation: ProcessOperation) => {
    if (!supports(operation)) throw invalidRequest(`The ${kind} process has no ${operation} operation`);
  };
  const base = (owner: string) => `${ownerPath(owner)}/processes/${definition.segment}`;
  const target = (owner: string, selector: ProcessSelector) =>
    `${base(owner)}/${selector === "latest" ? "latest" : segment(selector.processId, "processId")}`;
  const name = (suffix: string) => `${definition.objectType}.${suffix}`;

  return {
    kind,
    definition,
    supports,
    async list(owner, options) {
      ensure("list");
      return perform(context, { method: "GET", target: base(owner), query: queryOf(options), options });
    },
    async create(owner, body, options) {
      ensure("create");
      return performTyped(
        context,
        { method: "POST", target: base(owner), query: queryOf(options), body, options, requestDefinition: name("create") },
        undefined,
      );
    },
    async read(owner, selector, options) {
      ensure("read");
      return performTyped(
        context,
        { method: "GET", target: target(owner, selector), query: queryOf(options), options, responseDefinition: name("read") },
        definition.objectType,
      );
    },
    async update(owner, selector, body, options) {
      ensure("update");
      const method = options?.method ?? "PUT";
      if (method === "PATCH") assertPatch(body as PatchOperation[]);
      return performTyped(
        context,
        {
          method,
          target: target(owner, selector),
          query: queryOf(options),
          body,
          options,
          requestDefinition: method === "PUT" ? name("update") : undefined,
          responseDefinition: name("read"),
        },
        definition.objectType,
      );
    },
    async delete(owner, selector, options) {
      ensure("delete");
      return perform(context, { method: "DELETE", target: target(owner, selector), query: queryOf(options), options });
    },
    async approve(owner, selector, options) {
      ensure("transferApprove");
      return perform(context, {
        method: "POST",
        target: `${target(owner, selector)}/transferApprove`,
        query: queryOf(options),
        options,
      });
    },
    async reject(owner, selector, body, options) {
      ensure("transferReject");
      return perform(context, {
        method: "POST",
        target: `${target(owner, selector)}/transferReject`,
        query: queryOf(options),
        body,
        options,
        requestDefinition: name("transferReject"),
      });
    },
  };
}

/**
 * Operations on one resource type, with the paths of core Rule 1 to 6 and the methods of Table 2. `collectionPath` is
 * the path of the collection, relative to the base URL.
 */
export function createResourceOperations<Read, Create, Update>(
  context: OperationContext,
  definition: ResourceDefinition,
  collectionPath: string,
): ResourceOperations<Read, Create, Update> {
  const type = definition.type;
  const ownerPath = (id: string) => `${collectionPath}/${segment(id, `${type} identifier`, definition.aLabelIdentifier)}`;

  const processes: Partial<Record<ProcessKind, ProcessOperations>> = {};
  for (const [kind, processDefinition] of Object.entries(definition.processes) as [ProcessKind, ProcessDefinition][]) {
    processes[kind] = createProcessOperations(context, ownerPath, kind, processDefinition);
  }

  return {
    definition,
    processes,
    read: async (id, options) =>
      performTyped(
        context,
        { method: "GET", target: ownerPath(id), query: queryOf(options), options, responseDefinition: `${type}.read` },
        type,
      ),
    create: async (body, options) =>
      performTyped(
        context,
        {
          method: "POST",
          target: collectionPath,
          query: queryOf(options),
          body,
          options,
          requestDefinition: `${type}.create`,
          responseDefinition: `${type}.read`,
        },
        type,
      ),
    replace: async (id, body, options) =>
      performTyped(
        context,
        {
          method: "PUT",
          target: ownerPath(id),
          query: queryOf(options),
          body,
          options,
          requestDefinition: `${type}.update`,
          responseDefinition: `${type}.read`,
        },
        type,
      ),
    async patch(id, operations, options) {
      assertPatch(operations);
      return performTyped(
        context,
        {
          method: "PATCH",
          target: ownerPath(id),
          query: queryOf(options),
          body: operations,
          options,
          responseDefinition: `${type}.read`,
        },
        type,
      );
    },
    // DELETE takes no content (core Rule 4); the response may carry some.
    delete: async (id, options) => perform(context, { method: "DELETE", target: ownerPath(id), query: queryOf(options), options }),
    async query(body, options) {
      const mode = options?.validation ?? context.validation?.request ?? "enforce";
      const requestValidation = mode === "off" ? undefined : validateQueryObject(body);
      if (requestValidation?.status === "invalid" && mode === "enforce") {
        const first = requestValidation.issues[0];
        throw new RppError({
          kind: "schema-validation",
          direction: "request",
          definition: "query",
          issues: requestValidation.issues,
          message: `The Query Object is not valid: ${requestValidation.issues.length} issue(s), first ${first?.instancePath || "/"} ${first?.message ?? ""}`.trim(),
        });
      }
      const result = await perform(context, { method: "QUERY", target: collectionPath, body, options });
      const parsed = parseQueryResults(result.data);
      const warnings = envelopeWarnings(result.data, parsed, type);
      return {
        data: (parsed ?? { results: [] }) as QueryResults<Read>,
        meta: {
          ...result.meta,
          warnings: [...result.meta.warnings, ...warnings],
          validation: { ...result.meta.validation, ...(requestValidation && { request: requestValidation }) },
        },
      };
    },
    listProcesses: async (id, options) =>
      perform(context, { method: "GET", target: `${ownerPath(id)}/processes`, query: queryOf(options), options }),
    async availability(id, options) {
      if (definition.availabilityType === undefined) throw invalidRequest(`A ${type} has no availability operation`);
      const method = options?.method ?? "GET";
      const exchanged = await exchange(context, {
        method,
        target: `${ownerPath(id)}/availability`,
        query: queryOf(options),
        options,
      });
      const { response } = exchanged;
      // Core §16.4: 200 means it can be provisioned, 404 that it cannot; both are answers.
      const body = response.body.kind === "json" ? response.body.value : undefined;
      const isAvailabilityObject = objectTypeOf(body) === definition.availabilityType;
      const isAnswer = response.status === 404 && (method === "HEAD" || isAvailabilityObject);

      const warnings: string[] = [];
      let resultCode: ParsedResultCode | undefined;
      if (isAnswer) {
        resultCode = response.correlation.resultCode === null ? undefined : parseResultCode(response.correlation.resultCode);
        if (resultCode === undefined) warnings.push("The response has no RPP-Code header (core §6.2).");
      } else {
        const outcome = classifyResponse(response);
        if (!outcome.ok) throw new RppError(outcome.failure);
        resultCode = outcome.resultCode;
        warnings.push(...outcome.warnings);
        if (response.status !== 200) {
          throw new RppError({
            kind: "http",
            body: response.body,
            status: response.status,
            statusText: response.statusText,
            resultCode,
            correlation: response.correlation,
            exchangeId: response.exchangeId,
            message: `Availability answered with HTTP status ${response.status}, expected 200 or 404`,
            warnings,
          });
        }
        if (method === "GET" && !isAvailabilityObject) {
          warnings.push(`The response has no ${definition.availabilityType} object (core §16.4).`);
        }
      }

      const details = isAvailabilityObject ? (body as Availability<string>) : undefined;
      const available = response.status === 200;
      if (details && details.available !== available) {
        warnings.push(`HTTP ${response.status} contradicts available=${String(details.available)} in the Availability Object.`);
      }
      return { available, details, meta: metaOf(exchanged, resultCode, warnings, undefined) };
    },
  };
}
