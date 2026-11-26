# RPP Client — Project Instructions

## Mission

Build a browser-based, single-page RPP (RESTful Provisioning Protocol) client using Vite, React, and TypeScript. The application has three equally important modes:

1. **Registrar application** — realistic domain, contact, host, and related-object workflows.
2. **Protocol reference client** — demonstrate core RPP operations and supported extensions.
3. **Developer workbench** — inspect HTTP requests/responses, headers, schemas, validation, and protocol errors.

Treat the RPP specifications and the configured server's published capabilities as the source of truth. Do not invent protocol fields, endpoints, status codes, or extension semantics. Where the specification or server behavior is not yet established, isolate the assumption, document it, and make it configurable rather than silently hard-coding it.

## Technology baseline

- Vite
- React
- TypeScript with `strict: true`
- React Router
- TanStack Query for remote/server state
- React Hook Form for forms
- Ajv + `ajv-formats` for JSON Schema validation
- Zod only for local application configuration and UI-boundary parsing where useful; do not duplicate authoritative RPP JSON Schema definitions in Zod.
- Native `fetch` behind the RPP transport abstraction
- Vitest and React Testing Library for unit/component tests
- Playwright for end-to-end tests
- Tailwind CSS and shadcn/ui for presentation
- ietf-rpp-api-epp-proxy-python for backend RPP server interaction

Prefer stable, well-supported dependencies. Avoid adding a dependency for functionality that is straightforward to implement safely with the existing stack.

## Architectural boundaries

Keep these layers separate:

1. **Presentation (`src/app`, `src/components`, `src/features`)**
   - React routes, views, forms, tables, dialogs, and user interactions.
   - Must not construct raw protocol URLs or implement HTTP/authentication details.
2. **Application services (`src/application`)**
   - Use cases and orchestration between UI and protocol client.
   - Convert UI intent into typed client operations.
3. **RPP protocol (`src/rpp`)**
   - HTTP transport, request construction, authentication adapters, discovery, core models, schema validation, errors, and extension registry.
   - Must not import React or browser UI components.
4. **Infrastructure/configuration (`src/config`, `src/lib`)**
   - Environment parsing, safe logging, and shared non-protocol utilities.

The protocol package should be independently testable without mounting React. Keep dependencies flowing inward: UI may depend on application services and RPP abstractions; the RPP layer must never depend on UI features.

## RPP protocol rules

- Use the exact HTTP methods, resource paths, media types, headers, status codes, and JSON structures defined by the applicable RPP specifications and server capabilities.
- Do not assume that every server implements every optional feature or extension.
- Use capability discovery as the basis for enabling server-specific functionality. Discovery failures must be visible and must not be silently interpreted as “all features supported.”
- Model core protocol behavior separately from extension behavior.
- Preserve unknown response properties where practical; do not discard information merely because the current UI does not understand it.
- Do not map an unknown status or error to a misleading known value. Display its raw identifier and provide a safe fallback description.
- Keep protocol identifiers distinct from display labels.
- Treat dates, timestamps, IDNs, canonical identifiers, and URLs according to the relevant specifications. Do not normalize or transform values unless the specification requires it.
- Validate outbound and inbound payloads against the applicable schema when one is available. Report validation location and message; do not silently rewrite invalid data.
- Do not infer that a successful HTTP response necessarily means every requested operation succeeded; follow the RPP response model.
- Handle pagination, conditional requests, redirects, content negotiation, and caching only according to protocol/server support.
- Support `HEAD` and `OPTIONS` only where relevant to the actual API contract; do not assume that response-body behavior is identical to `GET`.
- Treat server-provided URLs and links as untrusted input. Enforce allowed-origin policy before following them, especially for authentication-bearing requests.

## Mandatory Agent Skills

For any task involving RPP protocol implementation, modification, review or testing:

- MUST read and follow `.agents/skills/rpp-client/SKILL.md`.
- MUST consult the relevant RPP specifications before implementing protocol behavior.
- MUST keep protocol implementation independent of React.
- MUST add or update protocol-level tests.

For tasks involving visual design, UI components or user interaction:

- MUST read and follow `.agents/skills/frontend-design/SKILL.md`.

For tasks involving both protocol and presentation:

- MUST use both skills and maintain the architectural separation between them.

## Authentication and security

Support multiple authentication mechanisms through an adapter/provider interface. Do not couple screens or domain workflows to one mechanism.

- Implement only mechanisms actually required by the target RPP specifications and deployment.
- Keep secrets out of source control, URLs, query strings, analytics, console output, error reports, and request/response history.
- Never persist access tokens or passwords in `localStorage` by default. Prefer memory-only token handling; if persistence is later required, document the threat model and use an appropriately secured design.
- Do not claim that browser storage is secure against XSS.
- Do not send credentials to a different origin after redirects unless explicitly permitted by a reviewed policy.
- Use HTTPS in production. Allow insecure local development only through an explicit development configuration.
- Apply least privilege and request only required scopes/permissions.
- Redact `Authorization`, cookies, client secrets, refresh tokens, and other sensitive fields in developer tooling.
- Do not implement OAuth flows by guessing. Follow the selected OAuth profile, issuer metadata, PKCE requirements, redirect URI rules, token audience, and authorization details defined by the deployment.
- Authentication provider errors must be actionable without exposing secrets.

## Extension architecture

- Extensions are registered as independent modules with stable identifiers.
- Discovery determines which extensions are available for a particular server/session.
- Each extension module may declare metadata, schemas, operations, capability requirements, and optional UI contributions.
- An extension must not become active merely because its code is bundled; it must also be advertised/enabled by the server according to the discovery contract.
- Unknown extensions must remain visible in diagnostic views where possible, even if no specialized UI is installed.
- Keep extension-specific types and schemas inside the extension module. Do not pollute core models with optional extension fields.
- Avoid runtime code execution from server-provided schemas or metadata. Treat them as data.
- Do not dynamically import arbitrary URLs supplied by a server.
- Support manual developer overrides only as an explicit, clearly labelled diagnostic feature; overrides must not be confused with server-confirmed capabilities.

## User experience

- Provide both task-oriented screens and a developer/protocol inspection area.
- Clearly distinguish server-confirmed capabilities from local client capabilities.
- Show loading, empty, partial, error, and unauthorized states.
- Confirm destructive or irreversible actions and show the target resource and operation.
- Preserve user-entered form data after recoverable errors.
- Display validation errors near fields and provide a structured error/diagnostic view.
- Provide accessible labels, keyboard navigation, focus management, and semantic HTML.
- Do not expose raw secrets in the developer console. Provide redacted request/response inspection.
- Avoid presenting mock/demo data as live server data. Label fixtures and demo mode prominently.

## TypeScript and code quality

- Keep `strict` mode enabled. Avoid `any`; use `unknown` at trust boundaries and narrow it.
- Prefer discriminated unions for protocol results, authentication states, and extension lifecycle states.
- Avoid non-null assertions unless an invariant is documented and tested.
- Keep functions small and side effects explicit.
- Use `AbortSignal` for cancellable network operations.
- Use stable query keys and invalidate affected queries after mutations.
- Do not duplicate server state in React component state when TanStack Query already owns it.
- Keep environment variables typed and validate them at startup.
- Add tests for protocol behavior, not only component rendering.

## Testing expectations

For every protocol feature, add tests for:
- Correct method, URL, headers, and serialized body.
- Successful responses and empty-body responses where applicable.
- Non-2xx responses and structured protocol errors.
- Malformed JSON and unexpected content types.
- Authentication failure and token refresh/retry behavior, if applicable.
- Abort/cancellation behavior.
- Schema validation failures.
- Unknown status values and unknown extension data.
- Cross-origin/redirect restrictions where relevant.

Use mocked `fetch` or a transport test double for deterministic unit tests. Never require a live registry for ordinary CI tests. Keep a separately configured integration-test suite for a controlled test server.

## Working conventions

- Before implementing protocol behavior, identify the normative specification or project reference that defines it.
- If a specification is supplied in the repository, read it before changing related code.
- For uncertain requirements, list the open question and avoid guessing.
- Prefer small, reviewable changes.
- Update this file and the RPP skill when project-wide architectural rules change.
- Keep `README.md` current with setup, configuration, scripts, supported operations, and known limitations.

## Further reading

- [docs/agents/architecture.md](docs/agents/architecture.md): product modes and dependency direction.
- [docs/agents/security.md](docs/agents/security.md): summary of the security rules above.
- [docs/agents/specifications.md](docs/agents/specifications.md): links to the latest RPP drafts and schemas on GitHub.
- [docs/agents/i18n.md](docs/agents/i18n.md): how UI text is translated (one file per locale, key rules, glossary).
