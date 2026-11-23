# RPP Client Starter

A Vite + React + TypeScript single-page application starter for an RPP frontend.

The intended product combines:
- A registrar-facing registry management interface.
- A reference client for RPP core protocol and extensions.
- A developer workbench for HTTP, JSON, schema, capability, and error inspection.

## Architecture

See:
- [`AGENTS.md`](./AGENTS.md) for repository-wide engineering instructions.
- [`.agents/skills/rpp-client/SKILL.md`](./.agents/skills/rpp-client/SKILL.md) for the RPP specialist workflow and protocol architecture.

The key boundary is that `src/rpp` is a framework-independent protocol client. React screens consume application services and must not implement HTTP details themselves.

## Recommended bootstrap

```bash
npm create vite@latest rpp-client -- --template react-ts
cd rpp-client
npm install

npm install @tanstack/react-query react-router-dom react-hook-form ajv ajv-formats zod

npm install -D vitest @testing-library/react @testing-library/jest-dom @playwright/test
```

Add Tailwind CSS and shadcn/ui using their current Vite installation instructions. Their setup evolves; use the official documentation rather than copying stale configuration.

## Suggested source layout

```text
src/
  app/
  application/
  components/
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
    auth/
    discovery/
    core/
    schemas/
    errors/
    extensions/
  config/
  lib/
  main.tsx
tests/
  unit/
  e2e/
```

## Initial implementation order

1. Bootstrap Vite, React, TypeScript, linting, formatting, and tests.
2. Add application shell, routing, and design system.
3. Implement typed configuration and server connection profile.
4. Implement the RPP transport and safe diagnostic redaction.
5. Implement discovery and capability snapshot.
6. Implement authentication provider interface and the required provider(s).
7. Implement schema registry and structured error parsing.
8. Implement core resource operations from the selected RPP specification.
9. Add extension registry and one real extension module.
10. Build registrar workflows and developer workbench on top of the protocol layer.

## Implemented so far

### HTTP transport (`src/rpp/client`)

`createFetchTransport(config)` returns an `RppTransport` whose `send()` resolves with a response of any HTTP status and rejects with `TransportError` (`src/rpp/errors`) when no response could be read. It is framework-independent; run its tests with `npm test`.

- **Origin policy:** relative targets resolve below the base URL path; absolute targets (server links) and redirects need an allowed origin. HTTPS only, `http:` needs `allowInsecureHttp`. Credentials from `authorizationHeaders` go to the base origin only; cookies are omitted by default.
- **Content negotiation:** `Accept` and `Content-Type` default to `application/rpp+json`. A preset is signalled by the `RPP-Preset` header or by `preset` and `preset-version` media type parameters (a server property, configured by the caller). Responses become `json`, `empty`, `malformed-json` or `unexpected-media-type`; the raw text is kept.
- **Redirects:** `reject` (default) or `follow-allowed`. Browsers hide the target of an unfollowed redirect, and a followed one is only checked after the fact (see `RppTransport.ts`).
- **Cancellation:** a caller `AbortSignal` and a timeout (default 30 s) give the distinct error kinds `aborted` and `timeout`.
- **Transaction ids:** every request carries `RPP-Cltrid`. Requests the client makes by itself, such as discovery and schema loading, get `rpp-client-` and eight random digits; one transport never hands out the same id twice, since a repeated id counts as a repeat of the request. The id sent is `sentClientTransactionId` on the response and is in the diagnostics.
- **Diagnostics:** every exchange, failed or not, is passed redacted to `onExchange`; `createExchangeLog()` keeps a bounded in-memory list. Authorization, cookies, and properties and query parameters named like passwords, tokens or `authInfo` are redacted before a record exists. Non-JSON bodies are stored as received, truncated.

### Capability discovery (`src/rpp/discovery`)

`createDiscoveryService({ transport, baseUrl }).discover()` fetches `/.well-known/rpp` at the origin root (without a preset) and resolves with `{ status: "ready" | "partial", snapshot }`. It rejects with `DiscoveryError` (`transport`, `http`, `content` or `invalid-document`); a failure is never read as "everything supported". `DiscoveryState` models the states for the UI.

- **Snapshot:** versions with base URLs, environment, TLDs, object types, advertised extensions, offered presets (flattened extensions, profiles, bound profiles, default flag), profiles, retrieval time and source, and the raw document (members the client does not model, such as `links`, `idnLgr` and `notices`, stay there).
- **Warnings:** problems that leave the document usable (an entry without id or version, a preset extension missing from the `extensions` list, not exactly one default preset, a non-https base URL) make the result `partial`; the affected entries are left out.
- **Queries (`capabilities.ts`):** `defaultPreset`, `findPreset`, `extensionsOfPreset`, `supportsObject`, `findVersion`, `advertisedExtensions`.
- **Extension detection (`extensionDetection.ts`):** `detectExtensions(advertised, local)` classifies each advertised extension as `available`, `version-mismatch` (exact version match) or `unrecognized`, and lists local implementations the server does not advertise. Activation by an extension registry is a later step.
- Server-provided `baseUrl` values are data; they must pass a transport's origin policy before they are used.

### Core protocol models (`src/rpp/core`, `src/rpp/schemas`, `src/rpp/errors`)

- **JSON structures and resource types (`core/types`):** TypeScript types of the read and request views of domain names, hosts, contacts, organisations, users, messages, processes and the component objects, written from the draft JSON schema. Every object type is open (`RppObject`: `@type` plus an index signature) so unknown members survive, and fields with a known set of values accept other strings (`OpenEnum`). `RESOURCE_TYPES`, `objectTypeOf` and `identifierOf` identify objects by `@type`. The types describe; they do not validate.
- **Statuses (`core/status/statuses.ts`):** `STATUS_VOCABULARIES` lists the labels of the status objects and which are client-settable; `describeStatus` gives a description and who sets it. An unknown label is returned as received with `known: false` and a neutral description, never mapped to a known one. Descriptions exist only for labels whose text was checked in the data objects draft.
- **Result codes (`core/status/resultCodes.ts`):** `parseResultCode` derives namespace, outcome and category from the five digits and looks the code up in core Table 11; `expectedHttpStatus` applies Tables 9 and 10. Malformed and unlisted codes stay inspectable.
- **Errors (`errors/`):** `parseRppProblem` reads a Problem Detail (core §9) leniently, keeping extension members and reporting deviations as warnings. `classifyResponse` turns an `RppHttpResponse` into `{ ok: true, data }` or `{ ok: false, failure }` where the failure is one of `authentication`, `authorization`, `rpp-protocol`, `http` or `content` (a 2xx with an unreadable body is a failure). `RppFailure` also covers `transport`, `schema-validation`, `schema-document`, `discovery` and `unknown`; `toFailure` normalizes any error thrown by a layer, and `RppError` carries a failure through promise rejections. Raw status, result codes, correlation headers, body and the diagnostics `exchangeId` are kept.
- **Schemas (`schemas/`):** a `SchemaRegistry` (Ajv, JSON Schema 2020-12, formats) holds the Preset Schema of each preset by identifier and version. `loadPresetSchema` fetches `presets/{id}/schema` as `application/schema+json`. A document is refused unless it is 2020-12, names the expected preset in `rpp:preset`, and is self-contained (no reference outside the document is ever resolved or fetched). Before use, `unevaluatedProperties: false` is added to every object schema as json §4.9.1 requires. `validate(key, definition, value)` returns `valid`, `invalid` with issues (JSON Pointer, schema path, keyword, params, message) or `unavailable` when no schema applies; it never changes the value.

### Core operations (`src/rpp/operations`)

`createRppClient({ transport, validation?, language? })` returns typed operations for `domains`, `contacts`, `hosts`, `organisations`, `users(organisationId)` and `messages`. Operations resolve with `{ data, meta }` and reject with `RppError` (no synchronous throws); nothing is retried.

- **Paths and methods** follow core Rules 1 to 6 and Table 2: `read` (GET), `create` (POST), `replace` (PUT), `patch` (PATCH with JSON Patch operations, checked against json §5.2 before sending), `delete` (DELETE, never with content), `availability` (GET or HEAD) and `listProcesses`. Operation parameters (`includeElements`, `hostsFilter`, `uName`, `lgr`, extension parameters) go in the query and arrays are repeated (Rule 7). Identifiers are percent-encoded; `.`, `..` and empty ones are refused, and domain and host names must be A-labels in a URL (`toALabel()` converts).
- **Processes:** `client.domains.processes.transfer|renew|restore|create`, `client.contacts.processes.transfer` and `client.hosts.processes.transfer` with `list`, `create`, `read`, `update`, `delete`, `approve` and `reject`, addressing `latest` or a process id. Which operations exist per process comes from the proxy's OpenAPI (`definitions.ts`); others are refused locally.
- **Availability:** HTTP 404 is an answer (core §16.4), so `availability()` returns `{ available, details, meta }` and fails only for other statuses or a 404 Problem Detail.
- **Headers:** `RPP-Cltrid` is sent on every request (core §6.1), set per call or generated by the transport, `Accept-Language` is optional, and object authorisation (`authorization: { value, roid? }`) is sent as `RPP-Authorization` and redacted in diagnostics.
- **Response metadata (`meta`):** status, result code, correlation ids, `RPP-Queue-Size`, `Location`, processes created as a side effect (`Link rel="rpp-process"`), diagnostics `exchangeId` and warnings (missing `RPP-Code`, `RPP-Cltrid` not echoed, a body of an unexpected `@type`).
- **Validation:** with `validation: { registry, preset }` requests are checked against `{type}.create` or `{type}.update` and refused when invalid (`enforce`); responses are checked against `{type}.read` and reported in `meta.validation` (`warn`). A call can override the mode, to send a broken request on purpose. Without a schema the result is `unavailable`, never `valid`.
- The `data` types are the draft's read views and are a claim; they hold when `meta.validation.response` is `valid`.

Not yet implemented: authentication providers, the extension registry. Schemas of extensions and profiles are only available as part of the Preset Schema of the server.

### Application shell, routing and design system (`src/app`, `src/components`, `src/features`)

Tailwind CSS v4 with shadcn/ui conventions (`components.json`, `cn()`, `cva` variants, the shadcn token names), fonts self-hosted through Fontsource, and the `@` alias for `src`. Run `npm run dev`; `npm run build` type-checks and builds.

- **Shell (`app/AppShell.tsx`):** a navigation column grouped as Registry, Extensions and Developer, a header line with the connection status, and the screen. Below `lg` the navigation is a drawer (focus moves into it, Escape closes it and returns focus, choosing a screen closes it). From `lg` up a button at the foot of the column collapses it to its icons (the label stays as the accessible name and tooltip, the capability mark moves to the icon's corner, the error console follows the width); the choice is kept in `localStorage`. There is a skip link, each screen sets the document title from its route `handle`, and navigating moves focus to the content.
- **Routing (`app/router.tsx`):** React Router data router; every item of `app/navigation.ts` is a route, with a not-found screen and an `errorElement`. Screens other than the overview are `PlannedPage`s until their workflow exists; they say so.
- **Capability awareness:** `useDiscoveryState()` gives the discovery state of the active server (`not-started` until a connection exists). Registry entries carry a `CapabilityMark`: filled when the server offers the object, a ring when not yet known, a bar when not offered. This is server confirmation only; it is separate from what the client implements. `PlannedPage` states the same in words.
- **Design system (`components/ui`, `components/common`, `components/protocol`):** `Button`, `Badge`, `Field` with `Input`, `Callout`, `PageHeader`, `Section`, `EmptyState`, and protocol-aware `ResultCodeChip`, `StatusLabel` (marks unknown labels) and `CapabilityMark`. Tones are never colour alone. Colours are tokens in `src/index.css`: teal ink for navigation, a cool paper ground, sodium as the single accent, and outcome tones with soft fills.
- Tests (`*.test.tsx`) run in jsdom through a per-file `@vitest-environment` comment.

### Dark mode, connection and authentication

- **Theme (`lib/theme.ts`, `components/common/ThemeToggle.tsx`):** Match system, Light or Dark, chosen in the header and stored in `localStorage` (a preference, nothing secret). The tokens of both themes are in `src/index.css`; components only use token classes, so they need no `dark:` variants.
- **Connection screen (`features/connection`):** server address, an explicit switch for plain HTTP (development only), and authentication None or User name and password (HTTP Basic, core §19). Connecting reads the discovery document and shows what the server offers (environment, versions, objects, presets, extensions, TLDs), with remarks for a partly usable document and a warning when the server advertises another address than the one entered (which is not followed). A failure explains itself, including the CORS case that looks like being offline. Bookmarks (`config/bookmarks.ts`, `features/connection/BookmarkBar.tsx`) keep a server for later, in a bar at the top of the screen with a list to pick from and Use, Edit and Delete buttons next to it: the address, the plain-HTTP switch, the authentication type and user name, and the preset settings, in `localStorage` under `rpp-client.bookmarks`, never the password. The connection name is the first field of the form and identifies a bookmark: names are unique (capitals aside), and saving under a name that is taken asks before it overwrites that bookmark. *Use* fills the form (name included) and puts the cursor in the password field, so only the password is left to enter before Connect; *Edit* loads it for changing, also under another name (renaming onto an existing name asks first and replaces that bookmark); *Delete* asks first. A bookmark's preset settings apply when you connect to its address; entries that no longer pass the form's checks (for example plain HTTP without the switch) are left out when read.
- **Session (`application/connection/session.ts`, `app/ConnectionProvider.tsx`):** one session per connection holds the authentication provider, the transport, the discovery service and the exchange log. Discovery runs through TanStack Query with a key that holds only the connection number; the result feeds `useDiscoveryState()`, so the status line and the capability marks of the menu follow it. Disconnecting clears the credentials and the query.
- **Credentials:** the address, the plain-HTTP choice and the user name are remembered; the password lives only in the session and is cleared from the form after connecting. Discovery and schema requests are sent without credentials (`authenticate: false`). The credentials are not verified when connecting, because discovery is public: the server checks them on the first operation. Basic over plain HTTP is warned about.
- **Authentication providers (`rpp/auth`):** `AuthenticationProvider` with `noAuthentication()` and `basicAuthentication()`; a provider that is cleared fails instead of sending requests unauthenticated.
- **Configuration (`config`):** Zod-validated form, stored profile and environment (`VITE_APP_TITLE`, `VITE_RPP_BASE_URL` prefills the address); a malformed variable fails at startup.
- **Preset in requests:** once capabilities are read, the Preset section on the Connection screen chooses the preset (the server's default, or any offered one) and how requests name it: the `RPP-Preset` header (default), media type parameters, or not at all. The choice applies from the next request and is stored with the profile; it is reset when the address changes. Discovery says nothing about which method a server accepts, so the method is a setting. Nothing is sent when the server marks no single default, the chosen preset is not offered, or its version is not a decimal; the screen says why. Discovery and schema requests never carry a preset. `resolvePreset` (`application/connection/preset.ts`) does the resolution and the transport reads the result per request.

- **Exchanges (`features/exchanges`, Developer menu):** lists every request of the session from its exchange log, newest first, updating live. Filter on method, path, status, result code or transaction id; pick one to see its address, timing, `RPP-Cltrid`/`RPP-Svtrid`, request and response headers and bodies (complete JSON is pretty-printed, a clipped body is marked), or the reason there was no response. The log is already redacted when it is recorded (credentials, secret-named properties and query parameters), the view adds nothing back, and Clear empties it. It is per connection and bounded to the last 200 exchanges.

- **Capabilities (`features/capabilities`, Developer menu):** the discovery document of the connected server, as received: where and when it was read, the environment, versions (an advertised address on another origin is marked and not followed), TLDs, profiles, objects (types this client does not know are marked), each preset with its base presets, extensions, profiles and bound profiles (the one sent with requests is marked), the advertised extensions with the presets that use them, parse remarks, the document members this client does not interpret, and the raw JSON. Extensions are shown as not supported by this client until extension modules exist; server-provided addresses are text, never links.

- **Domain names (`features/domains`, `application/domains`):** one screen with a tab for each registrar workflow, all acting on the name typed in the form. The use cases are in `application/domains/domainWorkflows.ts`, on top of the protocol client of the session (`session.client`); the UI never builds a URL.
  - *Info* reads the domain and shows everything: status labels (unknown ones marked), expiry, registrant, contacts, name servers, subordinate hosts, DNS data, the transfer password (only when asked for with `includeElements=authInfo`, hidden until shown), provisioning metadata, processes, members this client does not model, and the JSON.
  - *Check* is the availability operation (GET, so the reason comes with it) and leads on to *Register*, which sends the name, period (as a `domainCreateProcess`), registrant, contacts, name servers and transfer password. A Unicode name is sent as its A-label with `uName` and the LGR the registry needs.
  - *Change* loads the domain and sends a JSON Patch (`application/domains/domainPatch.ts`) with one operation per contact, name server or client status that comes or goes, a registrant add/replace/remove, and the transfer password; the operations are listed before they are sent. DNS data is not editable yet.
  - *Renew* sends the expiry date of the domain that was looked up, so a repeated renewal is refused, and an optional period. *Restore* asks for a restore, sends the report (separately, or with the request) and reads the status. *Transfer* asks (the password goes in `RPP-Authorization`, never the body), reads the status, withdraws, approves or rejects; approving, rejecting and withdrawing ask for confirmation. *Delete* needs the name typed.
  - What the server showed of a domain is kept in the TanStack Query cache under the connection number and A-label, and dropped when an action makes it stale.
  - Which workflows a server supports is not in its discovery document; only `domainName` is checked, so an unsupported operation fails with the registry's own answer.
  - Requests are not validated against the Preset Schema yet, because the session loads none; the server validates.
- **Request progress (`rpp/client/progress.ts`, `components/protocol/RequestProgress.tsx`):** the transport reports each request as it starts, is sent, is answered and is read, and the session keeps them in an activity log. After a click, the screen shows the latest request of that action only, as a track of three stretches (preparing, waiting for the registry, reading the answer), a light that runs along the stretch in progress with its elapsed time, the time of each stretch afterwards, and a way to stop waiting (the registry may still act on the request). A new request starts a track of its own and takes the place of the one before; the screens of an object keep no history of requests, the Exchanges screen does. Reduced motion shows a static bar instead of the moving light.

- **Message counter (`app/MessageCounter.tsx`, `rpp/client/queueMonitor.ts`):** in the header, a link to the Messages screen with the number of messages in the queue. The session's transport hands every response to a queue monitor, which keeps the last valid `RPP-Queue-Size` (core §6.2); a response without the header, with a value that is not a non-negative integer, or no response at all leaves it as it was. It shows a dash until a response has said, a plain count for 0, and the accent colour for 1 or more; the link's accessible name carries the count. A browser can only read the header cross-origin when the server lists it in `Access-Control-Expose-Headers`, which the proxy does.
- **Error console (`app/ErrorConsole.tsx`, `rpp/errors/errorLog.ts`):** a strip at the bottom of every screen with the number of errors of this connection and the latest one; it slides up to the history, newest first. An entry is any request that got an error status or no answer at all (an availability 404 is an answer, not an error). Each shows the time, status, result code and the registry's title and reason, and opens to the problem's `detail`, each error with its JSONPath, the RPP-Cltrid and RPP-Svtrid, and the redacted request and response bodies. New errors are counted until the console is opened; Escape closes it. While it is open the page gets the same height as extra room at its end, so a form or screen can be scrolled up clear of the console. The history belongs to the connection and survives clearing the Exchanges screen; Clear empties it. An error is also shown where it happened, next to the action. Errors found before a request is sent (such as an empty name) appear there but not in the console, because nothing was received.

- **Contacts (`features/contacts`, `application/contacts`):** the same shape as Domain names, with tabs for Info, Check, Create, Change, Transfer and Delete, acting on the identifier typed in the form. A contact's data is a JSContact Card; `application/contacts/contactCard.ts` reads and writes the members an EPP-style registry holds (kind, name, organisation, up to three street lines, city, region, postal code, country, phone, fax, email) and leaves the rest of the Card alone.
  - *Create* builds the Card from what was filled in; empty members are not sent. The address has two forms, as an EPP registry keeps them (RFC 5733 `postalInfo`): International (`int`), the Card's own address, plain ASCII only, which most registries require; and Localized (`loc`), the address of the Card's localization, in any characters. Create shows both together, and both are sent when filled in; Change has a list that chooses which of the two is on view, keeps both while you switch, and switches to the one with an error after a failed submit. Phone numbers are typed as `+CC.number` (with `xEXT` for an extension) and sent as telephone URIs; a country is two capital letters and is required once any member of that address is given. Each of these is checked before anything is sent. The forms are shaped by the Preset Schema of the preset the requests are made under (the chosen one, else the server's default): `contactSupport.ts` fetches `presets/{id}/schema` once per connection and validates a sample of each form against `contact.create`; a form the schema refuses is not offered. When only the localized form is allowed (the SIDN `nl.sidn.rpp.preset.epp-compatible`) the screen offers the name, organisation and address once and sends and reads them only in the localization; when only the international form is allowed it offers that alone; and a transfer password is only offered when the schema allows `authInfo`. While the schema is read the form is replaced by a notice, and when it cannot be read every field is offered with a notice saying why, so the server decides.
  - *Change* loads the contact and sends a JSON Patch with one operation per member that was added, changed or removed (street lines and address parts one by one, phone and email as entries), plus client statuses and a new transfer password. The operations are listed before they are sent, and the registry decides which it allows (many cannot remove a name or an email). The kind and the other localized members (name, organisation) are not changed here; a transfer password can be replaced, not removed.
  - *Transfer* and *Delete* work as for domain names, with the same confirmations; a contact that a domain still uses cannot be deleted.
- **Hosts (`features/hosts`, `application/hosts`):** the same shape, with tabs for Info, Check, Create, Change and Delete, acting on the host name typed in the form (a Unicode name is sent as its A-label). There is no Transfer tab: EPP moves a host with its superordinate domain, and the proxy implements no host transfer operation. A host's addresses are DNS records, which `application/hosts/hostData.ts` reads and writes: its own `ns` record (`@`, `nsdname`), and for each IPv4 or IPv6 address an `A` or `AAAA` record under the host's name. Other records are left alone.
  - *Info* shows the status labels, the IPv4 and IPv6 addresses, every DNS record, provenance, processes, members this client does not model, and the JSON.
  - *Create* sends the host with its `ns` record and one record for each address; addresses are optional (a host elsewhere has none), each is checked as an IP address first, and a registry may refuse addresses for a host that is not below one of its domains.
  - *Change* loads the host and sends a JSON Patch: a rename (`replace /hostName`), one `add` or `remove` (matched by type and address) on `/dns/records` for each address added or taken out, and the client statuses added or removed. The operations are listed before they are sent. After a rename the screen follows the host to its new name.
  - *Delete* asks for the name to be typed; a host that a domain uses as a name server cannot be deleted.
  - The shared parts of both screens (the tabs, the operation progress and outcome, confirmation, the transfer result, secrets and provisioning data) are in `components/common` and `features/shared`.

- **Processes (`features/processes`, `application/processes`, Registry menu):** the transfers, restores, renewals and creations of the domain names, contacts and hosts you have worked with, filtered by object type, process type and status (including *Active*: a pending transfer or restore) and paged with a selectable page size (10, 25, 50 or 100; 25 by default). RPP has no registry-wide list of processes (core Rule 6 lists them per object, and a server may answer 404 or 501), so the screen covers the objects this session has read the info of, created or changed: it collects them from the query cache (`features/shared/seenObjects.ts`), reads the process ids from their `processes` member, and reads each process that the contract has a read for (transfer, restore and the creation of a domain name; a renewal has none) to get its status, request date and registrars. *Read again* re-reads the objects and their processes. Filtering, sorting (newest request first) and paging are done in the client, and at most 100 processes are read at once. The proxy implements single-process reads only for transfers (domain names and contacts) and restores, so other processes show as *Cannot be read*.

- **Organisations (`features/organisations`, `application/organisations`):** tabs for Info, Create, Change and Delete of an organisation, and, when the server lists `user`, for User info, Create user, Change user and Delete user. The organisation and the user identifier typed in the form are shared by the tabs. *Change user* starts from the organisation: it reads the organisation and shows a table of its users (those the organisation lists, plus any read or created in this session that it does not list yet), and *Edit* on a row loads that user and shows its form. An organisation has roles (the key of `roles` is the type, such as `registrar`, with an optional `roleId` and the role status `clientLinkProhibited`; at least one is required), an optional parent, contact information, labelled contacts and the statuses a client may set; its contact information and a user's `details` are Cards, of which the forms edit the name, an email address and a phone number and leave the rest alone (`application/organisations/card.ts`). *Change* loads the object and sends a JSON Patch with one operation per role, contact, status or Card member that changed, listed before it is sent. The users of an organisation are not part of its update: a user is always created in an organisation (`POST /organisations/{id}/users`) and is known by the organisation and its identifier together, since the identifier is only unique within the organisation, so a user tab refuses to send without an organisation. A user's status can be set to `suspended` or `deactivated`; the registry sets the others. There is a Delete tab for organisations and a Delete user tab for one user. *Delete* first checks the organisation: when users are still linked to it (those it lists) it says so, lists them and offers no delete, unless *Delete all organisation users* is checked, which shows a warning that the users go with it. Deleting reads the organisation again, so a user added since the check is seen too: with users and without the option nothing is sent. With it the users are deleted one at a time and then the organisation; if a user cannot be deleted the organisation is left alone and the users already deleted are listed. Both deletes ask for the identifier to be typed. *Delete user* picks the user from the table of the organisation, as *Change user* does, and deletes only that one. The forms are not shaped by the Preset Schema as the contact forms are. The proxy does not implement organisations or users yet (it answers 501), so these screens need a server that does.

- **Messages (`features/messages`, `application/messages`, Registry menu):** the messages of the queue, read with `GET /messages` and shown in a table (identifier, type, object, creation date, status and a one-line summary). The draft says a query returns one message, but a server may return many, so the screen expects a list, takes a lone message as a list of one, and shows as many as *Show at most* says (10, 25, 50 or 100; 25 by default), with how many there are. *Message type* is a select box of the six types of the draft (review response, transfer request, transfer outcome, expiration deletion, auto-renewal and service notice), plus any other type seen; *Show messages* asks the server for that type (`?type=`) or for all, and warns when the server answers with other types too. Nothing is requested until that button is pressed, because retrieving a message marks it as delivered at the registry, and it comes back until it is acknowledged. A click on a message shows its details by the fields of its type (`application/messages/messages.ts`), the process it carries as a table of its members (`application/messages/process.ts`) with a link that opens the screen of its object on the matching tab (`/domains?name=…&tab=transfer`; the object screens read `name` and `tab` from the address), the members this client does not model, and the JSON; a type the client does not know is shown as received. *Acknowledge message* asks first and then sends `DELETE /messages/{id}`, which removes it from the queue and from the list.

- **Client (`features/client`, user icon in the header, `/client`):** the options of the person using the client, kept with the other settings in `rpp-client.settings`, never a password or token. *Default connection* is a saved bookmark that the Connection screen starts with (when nothing is connected). *Connect when the client starts* connects to it at startup (`config/defaultConnection.ts`, `ConnectionProvider`), but only when the bookmark has no authentication, as passwords are never kept. Display options: time zone for timestamps (this computer or UTC, `lib/dateTime.ts`), how many messages the Messages screen starts with, and how many processes a page of the Processes screen has.
- **Settings (`features/settings`, `config/appSettings.ts`, Developer menu):** choices for the client as a whole, kept in `localStorage` under `rpp-client.settings`. *Synthesize data* makes the screens that support it show examples this client makes up instead of asking the server. For now that is the Messages screen: with it on, *Show messages* creates two examples of each message type (`application/messages/synthesize.ts`, twelve in all, filtered by type like real ones), needs no connection, sends nothing, and acknowledging only removes an example from the list. Every example carries the identifier prefix `SYNTH-` and a *Synthesized* badge, and the screen says so at the top.

- **Schemas (`features/schemas`, Developer menu):** the Preset Schema of a preset (the server's default unless another is chosen), fetched from `presets/{id}/schema` as `application/schema+json` and shown as received. `schemaTree.ts` turns its `$defs` into a tree without resolving anything in place: each definition lists its properties (with *required*, type, constraints and description), composition as `allOf`/`anyOf`/`oneOf` with a branch for each schema, and `not allowed` for a `false` schema. A `$ref` has a *go to* button, and Enter on a node that only points elsewhere follows it. Nodes open and close by click or keyboard (the WAI-ARIA tree pattern: arrows, Home, End, Enter), *Expand all* and *Collapse all* work on what is shown, and the search matches names, types, constraints and descriptions, opens what leads to a match and marks it. A document the schema registry would refuse (wrong dialect, not self-contained) is still shown, with a remark. The raw JSON is not rendered until *Show effective schema* is pressed.

Not yet implemented: bearer and other authentication, DNS data editing for domain names, loading the Preset Schema into the session, and validating a payload against a schema on the schemas screen.

## Docker

The `Dockerfile` builds the app and serves the static files with nginx on port 8080 (`deploy/nginx.conf` sends unknown paths to `index.html`, so client-side routes survive a reload). `VITE_APP_TITLE` and `VITE_RPP_BASE_URL` are read at build time and end up in the bundle, so pass them as build arguments and never put secrets in them.

```sh
docker build -t rpp-client --build-arg VITE_RPP_BASE_URL=https://rpp.example/rpp .
docker run --rm -p 8080:8080 rpp-client
```

The browser calls the RPP server directly, so that server has to allow requests from the address the client is served from (CORS).

## Important

This starter intentionally does not invent RPP endpoints, media types, discovery documents, OAuth profiles, or extension semantics. Those must be filled in from the actual RPP specification set and target server contract before protocol operations are implemented.
