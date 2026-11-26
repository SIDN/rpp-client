import { type ObjectUpdate, fullUpdateOptions } from "@/application/updates/objectUpdate";
import { t } from "@/i18n";
import { invalidRequest } from "@/rpp/operations/paths";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { AvailabilityResult, OperationSuccess } from "@/rpp/operations/types";
import {
  checkUriTemplate,
  requestContactOperations,
  type RequestContact,
  type RequestContactAvailability,
  type RequestContactUpdate,
  type UriTemplateIssue,
} from "@/rpp/extensions/modules/denicRri";

/** Whitespace around the handle is dropped; nothing else is changed. */
export function parseRequestContactId(input: string): string {
  const id = input.trim();
  if (id === "") throw invalidRequest(t("requestContacts.errors.enterHandle"));
  return id;
}

/** One issue of a URI Template, as a registrar reads it. */
export function describeUriTemplateIssue(issue: UriTemplateIssue): string {
  switch (issue.code) {
    case "too-short": return t("requestContacts.template.tooShort", { min: issue.min });
    case "too-long": return t("requestContacts.template.tooLong", { max: issue.max });
    case "not-ascii": return t("requestContacts.template.notAscii");
    case "scheme": return t("requestContacts.template.scheme");
    case "unclosed-expression": return t("requestContacts.template.unclosed");
    case "stray-brace": return t("requestContacts.template.strayBrace");
    case "not-level-1": return t("requestContacts.template.notLevel1", { expression: `{${issue.expression}}` });
    case "unknown-variable": return t("requestContacts.template.unknownVariable", { variable: `{${issue.variable}}` });
    case "invalid-literal": return t("requestContacts.template.invalidLiteral", { character: issue.character === " " ? "␠" : issue.character });
  }
}

/** The issues of a template as text; empty when the template meets the constraints the client can check. */
export const uriTemplateProblems = (template: string): string[] => checkUriTemplate(template).map(describeUriTemplateIssue);

export interface Signal {
  signal?: AbortSignal;
}

export type RequestContactWorkflows = ReturnType<typeof createRequestContactWorkflows>;

/**
 * The registrar workflows on request contacts of the DENIC RRI extension. Only call this while the extension is active
 * for the connection: the server refuses the requests otherwise.
 */
export function createRequestContactWorkflows(client: RppClient) {
  const requestContacts = client.extension(requestContactOperations);
  return {
    /** Whether the handle is free (GET, so that the reason comes with the answer). A contact's handle is not. */
    async check(id: string, options: Signal = {}): Promise<AvailabilityResult<RequestContactAvailability>> {
      return requestContacts.availability(parseRequestContactId(id), options);
    },

    async info(id: string, options: Signal = {}): Promise<OperationSuccess<RequestContact>> {
      return requestContacts.read(parseRequestContactId(id), options);
    },

    /** The template is sent as typed; the server and the registry decide on it. */
    async create(input: { id: string; uriTemplate: string }, options: Signal = {}): Promise<OperationSuccess<RequestContact>> {
      return requestContacts.create({ "@type": "requestContact", id: parseRequestContactId(input.id), uriTemplate: input.uriTemplate }, options);
    },

    /**
     * Changes the template, the only member a client can change: a partial update (PATCH `replace /uriTemplate`, as in
     * the extension's example) or a full update (PUT of the update view).
     */
    async update(id: string, update: ObjectUpdate, options: Signal = {}): Promise<OperationSuccess<RequestContact>> {
      const handle = parseRequestContactId(id);
      return update.mode === "full"
        ? requestContacts.replace(handle, update.body as RequestContactUpdate, fullUpdateOptions(update, options))
        : requestContacts.patch(handle, update.operations, options);
    },
  };
}
