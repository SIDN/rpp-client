# Security

The rules for this client are in the "Authentication and security" section of [AGENTS.md](../../AGENTS.md). In short:

- **Secrets stay out of source control.** Credentials come from the user at connect time or from untracked configuration.
- **Secrets stay out of URLs, logs and history.** `Authorization`, cookies and tokens are redacted in the exchange log and in console output.
- **Tokens and passwords are kept in memory only.** Nothing is written to `localStorage` by default, and browser storage is not claimed to be safe against XSS.
- **Server-provided URLs are untrusted.** Credentials are sent only to the configured origin, also after redirects.
- **Server-provided schemas and metadata are data.** They are never executed or imported.
- **Escape at the output boundary.** Values shown in the UI go through React's escaping; never use `dangerouslySetInnerHTML` for server content.
