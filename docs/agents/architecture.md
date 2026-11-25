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
                                   +--> compatible: activate
                                   |
                                   +--> incompatible: show diagnostic
```

Server metadata is data, never executable code.

## Authentication

The transport requests authorization headers from an authentication provider. The provider owns its own protocol-specific lifecycle. Screens consume a normalized session state and do not inspect token formats.

Do not assume that every browser authentication mechanism is interchangeable. Some mechanisms may require browser support, user interaction, or deployment infrastructure.
