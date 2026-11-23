import type { ErrorObject } from "ajv";

/** One validation failure, with the machine-readable parts of the Ajv error kept. */
export interface ValidationIssue {
  /** JSON Pointer into the validated value; "" is the value itself. */
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message: string;
}

export type ValidationResult =
  | { status: "valid" }
  | { status: "invalid"; issues: ValidationIssue[] }
  /** No schema could be applied, so the value is neither valid nor invalid. */
  | { status: "unavailable"; reason: string };

export function toIssues(errors: readonly ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    params: { ...error.params },
    message: error.message ?? `failed ${error.keyword}`,
  }));
}

/**
 * The JSON Pointer of the member an issue is about: for `required` and `unevaluatedProperties` the property is in
 * the parameters, not in the instance path.
 */
export function issueTarget(issue: ValidationIssue): string {
  const member =
    issue.keyword === "required"
      ? issue.params.missingProperty
      : issue.keyword === "unevaluatedProperties"
        ? issue.params.unevaluatedProperty
        : issue.keyword === "additionalProperties"
          ? issue.params.additionalProperty
          : undefined;
  if (typeof member !== "string") return issue.instancePath;
  return `${issue.instancePath}/${member.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}
