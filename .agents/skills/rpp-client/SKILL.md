---
name: rpp-client
description: Design, implement, review, and test the RPP protocol layer and its React frontend integration. Use when working on RPP HTTP/JSON operations, discovery, authentication, schemas, resource workflows, statuses, errors, or extensions.
---

# RPP Client Engineering Skill

## Purpose

This skill governs implementation of the RPP browser client. The application is simultaneously:

- A practical registrar interface for managing registry objects.
- A reference implementation demonstrating RPP core and extension behavior.
- A developer workbench for examining protocol traffic and diagnosing interoperability.

The RPP specification set and the target server's published capabilities are authoritative. This skill describes engineering structure; it does not replace protocol specifications.

## First steps

Before coding:

1. Inspect `AGENTS.md`, package scripts, source layout, and existing tests.
2. Identify the RPP specification/draft version and relevant sections for the requested behavior.
3. Identify the relevant backend server implementation (e.g., ietf-rpp-api-epp-proxy-python) and any server-specific behaviors.
4. Identify whether the behavior is core protocol or extension-specific.
5. Determine the server capability/discovery signal that enables the behavior.
6. Check whether a JSON Schema or other normative data model exists.
7. Record unresolved questions. Do not fill protocol gaps with assumptions.
8. Implement the protocol layer first, then application service, then UI.

When the repository contains specification text or schema files, inspect those local sources rather than relying on memory.

## Recommended source layout

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  application/
    services/
    queries/
    commands/
  components/
    layout/
    common/
    forms/
    protocol/
  features/
    dashboard/
    domains/
    contacts/
    hosts/
    registrar/
    developer/
    extensions/
  rpp/
    client/
      RppClient.ts
      RppTransport.ts
      request.ts
      response.ts
    auth/
      AuthenticationProvider.ts
      providers/
    discovery/
      DiscoveryService.ts
      capability-types.ts
    core/
      types/
      operations/
      status/
    schemas/
      SchemaRegistry.ts
      validation.ts
    errors/
      RppError.ts
      error-parser.ts
    extensions/
      ExtensionRegistry.ts
      ExtensionModule.ts
      modules/
  config/
  lib/
```

Keep this structure pragmatic. Do not create empty abstractions without a real use case.

## Core abstractions

### Transport

Create a transport abstraction around `fetch`. It should own:

- Base URL and allowed-origin policy.
- HTTP method, path, headers, and body serialization.
- Content negotiation.
- Abort signals and request timeouts where appropriate.
- Redirect policy.
- Response status and header handling.
- Safe, redacted diagnostics.

The transport must not know about React, forms, or domain-page components.

Do not concatenate arbitrary server-provided URLs with credentials. Resolve relative links against a configured base URL and validate the resulting origin before following them.

### RPP client

Expose typed protocol operations through a client facade. Keep HTTP details out of UI code. Prefer operation-oriented methods over generic calls in feature components.

Illustrative shape (adapt to the actual RPP specification; names below are architectural examples, not protocol-defined endpoints):

```ts
interface RppClient {
  readonly discovery: DiscoveryService;
  readonly domains: DomainOperations;
  readonly contacts: ContactOperations;
  readonly hosts: HostOperations;
  readonly raw: RawRequestDiagnostics;
}
```

Do not add an operation until its method, target, request/response representation, and error semantics are confirmed from the applicable specification or server contract.

### Authentication provider

Use a provider interface so the transport does not depend on one authentication method.

Illustrative shape:

```ts
interface AuthenticationProvider {
  readonly id: string;
  authenticate(context: AuthenticationContext): Promise<AuthenticationResult>;
  getAuthorizationHeaders(
    request: AuthenticatedRequest
  ): Promise<HeadersInit>;
  clearSession(): Promise<void>;
}
```

The interface must be adjusted to the real lifecycle of the supported mechanisms. Avoid forcing fundamentally different flows into misleading common methods.

Potential provider implementations may include OAuth 2.0 (with the deployment's required profile, PKCE, issuer metadata and authorization details), mutual TLS where the browser/deployment supports it, and other mechanisms explicitly required by the target environment. Do not implement Basic authentication or any other mechanism merely because it is familiar; first confirm that it is required.

The UI should depend on authentication state and capabilities, not on provider-specific token formats.

### Discovery and capabilities

Discovery must produce a typed capability snapshot that records:

- Server identity and relevant protocol/version information, if exposed.
- Core features and operations advertised by the server.
- Supported extensions and their identifiers/versions.
- Relevant links, schemas, profiles, or media types.
- Retrieval time and source.
- Discovery warnings or partial failures.

Represent capability state explicitly, for example:

```ts
type DiscoveryState =
  | { status: "not-started" }
  | { status: "loading" }
  | { status: "ready"; snapshot: CapabilitySnapshot }
  | { status: "partial"; snapshot: CapabilitySnapshot; warnings: string[] }
  | { status: "failed"; error: Error };
```

Do not treat failed discovery as unrestricted support. Do not conflate a client feature being implemented with a server advertising support for it.

### JSON Schema validation

Use Ajv for JSON Schema validation. Maintain a schema registry keyed by stable schema identifiers and versions. Support the dialect actually used by the RPP specification and schemas; do not assume a dialect without checking.

Validation output should preserve machine-readable details where available:

- Instance path / JSON Pointer.
- Schema path.
- Keyword.
- Parameters.
- Human-readable message.

Do not mutate payloads during validation unless the application has an explicit, user-visible normalization step required by the specification.

### Errors

Normalize transport failures and protocol errors into a structured internal representation without losing the original status, headers, response body, or protocol error identifier (subject to redaction).

Distinguish at least:

- Network/connection failure.
- Abort/cancellation.
- Authentication/authorization failure.
- HTTP-level failure.
- RPP protocol error.
- Content-type or parsing failure.
- Schema validation failure.
- Discovery failure.

Unknown errors and status identifiers must remain inspectable. Never silently map them to a known error.

## Extension module model

Treat extensions as plug-in modules compiled into the client, then activated only when the server advertises support.

Illustrative interface:

```ts
interface RppExtensionModule {
  readonly id: string;
  readonly displayName: string;
  readonly supportedVersions: readonly string[];
  register(context: ExtensionRegistrationContext): void;
}
```

An extension module may contribute:

- Metadata and version compatibility rules.
- JSON Schemas.
- Typed operations.
- Capability requirements.
- Status/error definitions.
- Optional navigation entries, forms, panels, or detail views.

Keep UI contributions optional. A developer workbench should still be able to inspect extension data without a specialized screen.

Rules:

1. Use the extension's protocol-defined identifier, not a display name, as its key.
2. Match advertised versions according to the specification's compatibility rules.
3. Do not activate a module based only on a locally bundled implementation.
4. Do not execute JavaScript, expressions, templates, or remote code received from a server.
5. Unknown advertised extensions should be shown as unsupported/unrecognized, not silently ignored.
6. Keep extension data separate from core resource types unless the specification explicitly defines it as core.
7. Manual capability overrides, if implemented, must be visibly marked as local overrides and must not rewrite the server's actual discovery result.

## UI integration

### Application modes

Organize navigation around three modes:

- **Registry operations:** dashboard, domains, contacts, hosts, and other supported objects.
- **Developer tools:** capability explorer, request/response inspector, schema validation, and diagnostics.

Do not show an action as available unless both the client implements it and the current server capability snapshot permits it.

### Data fetching and mutations

- Use TanStack Query for server state.
- Use stable query keys that include server identity and relevant resource identifiers.
- Use mutations for state-changing operations and invalidate only affected queries.
- Pass `AbortSignal` from query functions to the transport.
- Avoid duplicate fetching state in local React state.
- Keep sensitive authentication material out of query keys and cached diagnostic payloads.

### Forms

- Use React Hook Form for complex forms.
- Validate with the applicable RPP JSON Schema through Ajv.
- Map JSON Pointer instance paths to form fields where possible.
- Preserve user input on server-side validation errors.
- Show both concise field-level feedback and a structured diagnostic view.
- Distinguish client-side validation from server-reported validation.

### Developer workbench

Provide a redacted inspector for:

- Request method and target URL.
- Request headers (sensitive values redacted).
- Request body.
- Response status and headers (sensitive values redacted).
- Response body.
- Timing and correlation/request identifiers where available.
- Schema validation results.
- Parsed protocol error details.

Never store or display bearer tokens, cookies, passwords, refresh tokens, private keys, or client secrets. Ensure redaction occurs before data enters persistent logs or browser storage, not merely at render time.

## Multiple authentication mechanisms

Design for multiple mechanisms without assuming every mechanism is available in every browser or deployment.

- Select the mechanism from explicit server/deployment configuration and supported discovery metadata.
- Keep provider-specific configuration isolated.
- Model unauthenticated, authenticating, authenticated, expired, and failed states.
- Handle token expiry and refresh only according to the selected authentication profile.
- Use PKCE for browser-based OAuth authorization-code flows when required by the applicable profile.
- Validate issuer, audience, redirect URI, scopes/authorization details, and state/nonce requirements as applicable.
- Never put credentials or tokens in URLs.
- Do not automatically retry non-idempotent operations after authentication renewal unless the request's replay safety is established.
- Do not assume browser JavaScript can use a client certificate or access a private key; deployment and browser constraints matter.
- Document any mechanism that requires a reverse proxy, browser configuration, or platform-specific support.

## IDN and identifier handling

When implementing internationalized domain names or other Unicode identifiers:

- Follow the exact IDNA/IDN profile required by the RPP specification and registry policy.
- Keep user-entered Unicode and protocol wire representations distinct where required.
- Apply NFC or other normalization only where explicitly required.
- Do not assume that lowercasing, Unicode normalization, or U-label/A-label conversion is harmless for every identifier.
- Preserve the original input for display/audit where appropriate.
- Test valid, invalid, contextual, deviation, and edge-case labels against the selected profile and test vectors.

## Statuses and extensible values

- Treat status identifiers as protocol data, not as translated labels.
- Keep status identifier, status type, display label, and any extension-defined attributes separate.
- Do not assume a status is unique by label if the data model permits multiple instances.
- Preserve unknown status values and attributes.
- Apply status transitions and mutability rules only when specified by the relevant protocol contract.

## Testing checklist

For each operation or extension, test:

- Correct method, path/target, media types, Accept and other required headers.
- Correct serialization and omission/null semantics.
- Success response parsing, including empty-body responses where defined.
- Non-success HTTP responses and protocol error bodies.
- Malformed JSON, unexpected media types, and schema mismatch.
- Unknown properties, statuses, and extension identifiers.
- Discovery success, partial discovery, and failure.
- Authentication success, expiry, denial, cancellation, and safe retry behavior.
- Abort signals and request cancellation.
- Origin validation and redirect behavior.
- Redaction of secrets in diagnostics.

Use deterministic mocked transport tests for normal CI. Keep live-server integration tests separate and explicitly configured.

## Review checklist

Before considering work complete, verify:

- [ ] Behavior is backed by a specification or documented server contract.
- [ ] Core and extension responsibilities remain separate.
- [ ] Server capability discovery controls feature availability.
- [ ] UI does not contain raw HTTP/protocol implementation.
- [ ] Unknown protocol data is not silently discarded.
- [ ] Secrets are redacted before logging/caching.
- [ ] Error and partial states are visible.
- [ ] Tests cover success, failure, malformed data, and unknown values.
- [ ] Accessibility and keyboard interaction are considered.
- [ ] Documentation describes limitations and unresolved questions.
