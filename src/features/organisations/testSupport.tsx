/** Fixtures and helpers shared by the tests of the Organisations and Users screens. */
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { SettingsContext } from "@/app/settings-context";
import { DEFAULT_SETTINGS } from "@/config/appSettings";
import { Providers } from "@/app/providers";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS, type ConnectionProfile } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";

export const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS } as const;

/** A logged-in user of ORG-1, the organisation the Users screen works in. */
export const USER_PROFILE: ConnectionProfile = { ...PROFILE, auth: { type: "basic", username: "jane", organisation: "ORG-1" } };

export const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

export const discoveryWith = (objects: string[]): DiscoveryState => ({
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["test"],
      presets: [{ id: "p", version: "1.0", defaultPreset: true, extensions: [] }],
      objects,
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot,
});

export const ORGANISATION = {
  "@type": "organisation",
  id: "ORG-1",
  provMetadata: { "@type": "provMetadata", spClientId: "REG-1", crDate: "2024-01-01T00:00:00Z" },
  status: [{ "@type": "organisationStatus", label: "ok" }],
  roles: { registrar: { "@type": "organisationRole", roleId: "1234" } },
  parent: { "@type": "organisation", id: "ORG-0" },
  contactInfo: { "@type": "Card", version: "2.0", name: { full: "Example Registrar" }, emails: { email: { address: "info@example.test" } } },
  contacts: [{ label: "admin", object: { "@type": "contact", id: "C-1" } }],
  users: [{ label: "admin", object: { "@type": "user", id: "U-1" } }],
  weird: { extra: true },
};

export const USER = {
  "@type": "user",
  id: "U-1",
  details: { "@type": "Card", version: "2.0", name: { full: "Jane Doe" } },
  description: "Administrator",
  status: { "@type": "userStatus", label: "active" },
  organisation: { "@type": "organisation", id: "ORG-1" },
};

export type Call = { method: string; path: string; body: unknown };
export type Responder = (request: Call) => Response | Promise<Response>;

export const answer = (body: unknown, init: { status?: number; code?: string } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/rpp+json", "RPP-Code": init.code ?? "01000", "RPP-Svtrid": "S-7" },
  });

export function renderPage(page: ReactElement, responder: Responder, discovery: DiscoveryState = discoveryWith(["organisation", "user"]), entry = "/", profile: ConnectionProfile = PROFILE, synthesize = false) {
  const calls: Call[] = [];
  const session = createSession(profile, profile.auth.type === "basic" ? { password: "secret" } : undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const request = {
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`.replace("/rpp", ""),
        body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
      };
      calls.push(request);
      return responder(request);
    },
  });
  const snapshot = discovery.status === "ready" ? discovery.snapshot : undefined;
  render(
    <Providers>
      <MemoryRouter initialEntries={[entry]}>
        <SettingsContext.Provider value={{ settings: { ...DEFAULT_SETTINGS, synthesizeData: synthesize }, update: () => {} }}>
          <ConnectionContext.Provider value={{ session: discovery.status === "not-started" ? undefined : session, lastProfile: profile, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
            <DiscoveryContext.Provider value={discovery}>
              {page}
            </DiscoveryContext.Provider>
          </ConnectionContext.Provider>
        </SettingsContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { calls };
}

export const deleted = () => new Response(null, { status: 200, headers: { "RPP-Code": "01000", "RPP-Svtrid": "S-8" } });
export const withUsers = (...ids: string[]) => ({ ...ORGANISATION, users: ids.map((id) => ({ label: "admin", object: { "@type": "user", id } })) });
