# Architecture Overview

## Product modes

| Mode | Main purpose |
|---|---|
| Registry operations | Perform supported registrar workflows |
| Reference client | Demonstrate core RPP and extension features |
| Developer workbench | Inspect capabilities, HTTP traffic, schemas, and errors |

## Dependency direction

```text
React routes and feature UI
          |
          v
Application services / use cases
          |
          v
Framework-independent RPP client
          |
          v
Fetch transport + authentication adapter
          |
          v
RPP server
```

The RPP client must not import React. UI features must not construct protocol requests directly.

## Capability-aware feature availability

A feature should be enabled only when all of these are true:

1. The client has an implementation for it.
2. Discovery confirms that the server supports the required capability or extension.
3. The active authentication context is authorized to perform it, where authorization information is available.
4. Required local configuration is valid.

Keep these facts separate in the UI. In particular, do not label a client-implemented feature as server-supported before discovery.

## Extension lifecycle

```text
Bundled module
     |
     v
Module registered locally
     |
     v
Server discovery completed
     |
     +---- not advertised ----> unavailable for this server
     |
     +---- advertised --------> compatibility check
                                   |
                                   +--> compatible --> in the preset requests use?
                                   |                      |
                                   |                      +--> yes: activate
                                   |                      +--> no: show diagnostic
                                   |
                                   +--> incompatible: show diagnostic
```

Server metadata is data, never executable code.

### Where extension code lives

| Layer | Path | Holds |
|---|---|---|
| Protocol | `src/rpp/extensions/ExtensionRegistry.ts` | `BUNDLED_EXTENSIONS` and `activationOf(module, snapshot, preset)` |
| Protocol | `src/rpp/extensions/modules/<name>/` | the module's metadata, its own types, schema definition names (`ext.<prefix>.*`) and operations built with `client.extension(factory)` |
| Application | `src/application/extensions/<name>/` | use cases and body builders; core workflows take extension members through `extensionMembers`, never as core fields |
| Presentation | `src/features/extensions/<name>/` | screens and fields, gated by `useExtensionActive(module)` |

An extension is in effect only under a preset that includes it (the preset requests carry, else the server's default).
Core screens show an extension's members as unknown members until the extension is active.

## Authentication

The transport requests authorization headers from an authentication provider. The provider owns its own protocol-specific lifecycle. Screens consume a normalized session state and do not inspect token formats.

Do not assume that every browser authentication mechanism is interchangeable. Some mechanisms may require browser support, user interaction, or deployment infrastructure.
