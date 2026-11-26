# Test fixtures

- `rri-preset-schema.json`: the Preset Schema of `de.denic.rpp.preset.rri` 1.0 as the
  [proxy](https://github.com/pawel-kow/ietf-rpp-api-epp-proxy-python) composes it (`compose()` of
  `src/rpp/schema/effective_schema.py`, without `$id`), generated on 2026-11-26. It holds every base definition and those
  of the DENIC RRI extension. Regenerate it when the drafts or the extension change.
