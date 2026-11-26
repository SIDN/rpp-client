# RPP specifications

The RPP drafts are the normative source for protocol behaviour (see [AGENTS.md](../../AGENTS.md)). Read the relevant
draft before changing protocol code, and cite the section in the change. The drafts are Internet-Drafts and still
change, so check the current text on `main` rather than relying on memory.

Last checked: 2026-11-24. The version numbers below are a snapshot; refresh them when the drafts move.

## Working group drafts

The latest text of each draft is rendered from `main` at
`https://ietf-wg-rpp.github.io/<draft-name>/<draft-name>.txt` (also `.html`). Read that rendered text first; it can be
ahead of the last tagged or published version.

| Draft | Defines | Latest text (rendered from `main`) | Source |
|---|---|---|---|
| `draft-ietf-rpp-core` | HTTP layer: methods, resource paths, headers, status codes, discovery, authorization | [-02 txt](https://ietf-wg-rpp.github.io/draft-ietf-rpp-core/draft-ietf-rpp-core.txt), [html](https://ietf-wg-rpp.github.io/draft-ietf-rpp-core/draft-ietf-rpp-core.html) | [md](https://github.com/ietf-wg-rpp/draft-ietf-rpp-core/blob/main/src/draft-ietf-rpp-core.md) |
| `draft-ietf-rpp-data-objects` | Domain, contact, host, organisation and related data objects, and the IANA registry | [-03 txt](https://ietf-wg-rpp.github.io/draft-ietf-rpp-data-objects/draft-ietf-rpp-data-objects.txt), [html](https://ietf-wg-rpp.github.io/draft-ietf-rpp-data-objects/draft-ietf-rpp-data-objects.html) | [md](https://github.com/ietf-wg-rpp/draft-ietf-rpp-data-objects/blob/main/src/draft-ietf-rpp-data-objects.md) |
| `draft-ietf-rpp-json` | JSON data format, including processes and responses | [-02 txt](https://ietf-wg-rpp.github.io/draft-ietf-rpp-json/draft-ietf-rpp-json.txt), [html](https://ietf-wg-rpp.github.io/draft-ietf-rpp-json/draft-ietf-rpp-json.html) | [md](https://github.com/ietf-wg-rpp/draft-ietf-rpp-json/blob/main/src/draft-ietf-rpp-json.md) |
| `draft-ietf-rpp-requirements` | Requirements | [txt](https://ietf-wg-rpp.github.io/draft-ietf-rpp-requirements/draft-ietf-rpp-requirements.txt) (rendering is older than the source; expires May 2026) | [md](https://github.com/ietf-wg-rpp/draft-ietf-rpp-requirements/blob/main/src/draft-ietf-rpp-requirements.md) |
| `draft-ietf-rpp-architecture` | Overall architecture (no rendered version) | none | [adoc](https://github.com/ietf-wg-rpp/draft-ietf-rpp-architecture/blob/main/draft-ietf-rpp-architecture-01.adoc) |

Repositories (all under <https://github.com/ietf-wg-rpp>):
[core](https://github.com/ietf-wg-rpp/draft-ietf-rpp-core),
[data-objects](https://github.com/ietf-wg-rpp/draft-ietf-rpp-data-objects),
[json](https://github.com/ietf-wg-rpp/draft-ietf-rpp-json),
[architecture](https://github.com/ietf-wg-rpp/draft-ietf-rpp-architecture),
[requirements](https://github.com/ietf-wg-rpp/draft-ietf-rpp-requirements).

Rendered versions are on the [IETF datatracker](https://datatracker.ietf.org/wg/rpp/documents/).

## Machine-readable schemas

- Discovery document: [rpp-discovery.schema.json](https://github.com/ietf-wg-rpp/draft-ietf-rpp-core/blob/main/src/schemas/rpp-discovery.schema.json) (in the core repository).
- Data objects as OpenAPI/JSON Schema: `src/rpp/schema/schemas/draft-ietf-rpp-data-objects.yaml` and `src/rpp/openapi.yaml` in the
  [ietf-rpp-api-epp-proxy-python](https://github.com/pawel-kow/ietf-rpp-api-epp-proxy-python) repository, which is the backend this client talks to.
  The proxy may lag or differ from the drafts; when they disagree, the draft wins and the difference is documented as an assumption.

## Extensions implemented by this client

| Extension | Version | Definition | Schema |
|---|---|---|---|
| `de.denic.rpp.rri` (DENIC RRI) | 0.2.0 | [rri-extension.md](https://github.com/pawel-kow/ietf-rpp-api-epp-proxy-python/blob/main/docs/rri/rri-extension.md) (draft-kowalik-rpp-denic-rri-00) | [rri-extension.schema.json](https://github.com/pawel-kow/ietf-rpp-api-epp-proxy-python/blob/main/.spec/rri-extension.schema.json) |

## Other working group material

- [wg-materials](https://github.com/ietf-wg-rpp/wg-materials): agendas, minutes and WG decisions.
- [Agents.md of the data objects draft](https://github.com/ietf-wg-rpp/draft-ietf-rpp-data-objects/blob/main/Agents.md): conventions for the RPP notation.

## Refreshing this list

```sh
curl -s https://ietf-wg-rpp.github.io/draft-ietf-rpp-core/draft-ietf-rpp-core.txt | grep -m1 -oE "draft-ietf-rpp-core-[0-9]+"
```

Repeat for each draft, then update the version numbers and the "Last checked" date.
