// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { Providers } from "@/app/providers";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { SchemasPage } from "./SchemasPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" } as const;

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const discovery = (): DiscoveryState => ({
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["test"],
      presets: [
        { id: "p", version: "1.0", name: "Plain", description: "The plain preset", defaultPreset: true, extensions: [] },
        { id: "q", version: "2.0", name: "Other", defaultPreset: false, extensions: [] },
      ],
      objects: ["contact"],
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot,
});

const schema = (id: string, extra: Record<string, unknown> = {}) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  "rpp:preset": { id, version: id === "p" ? "1.0" : "2.0" },
  $defs: {
    Card: {
      type: "object",
      description: "A contact card",
      properties: { name: { $ref: "#/$defs/Name" }, email: { type: "string", format: "email" } },
      required: ["name"],
    },
    Name: { type: "object", properties: { full: { type: "string" } } },
    "profile.contact": { properties: { authInfo: false } },
  },
  ...extra,
});

type Responder = (path: string, headers: Headers) => Response;

const schemaResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/schema+json", "RPP-Code": "01000", "RPP-Svtrid": "S-1" } });

function renderPage(respond: Responder = (path) => schemaResponse(schema(path.includes("/q/") ? "q" : "p")), state: DiscoveryState = discovery()) {
  const paths: string[] = [];
  const accepts: (string | null)[] = [];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const path = (input as URL).pathname.replace("/rpp", "");
      paths.push(path);
      const headers = new Headers(init?.headers);
      accepts.push(headers.get("Accept"));
      return respond(path, headers);
    },
  });
  const snapshot = state.status === "ready" ? state.snapshot : undefined;
  render(
    <Providers>
      <MemoryRouter>
        <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
          <DiscoveryContext.Provider value={state}>
            <SchemasPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { paths, accepts };
}

const tree = () => screen.getByRole("tree", { name: "Schema definitions" });
const labelOf = (entry: HTMLElement) => entry.querySelector("span")?.textContent;
const item = (name: string) => {
  const found = within(tree()).getAllByRole("treeitem").find((entry) => labelOf(entry) === name);
  if (!found) throw new Error(`No tree item ${name}`);
  return found;
};
const labels = () => within(tree()).getAllByRole("treeitem").map(labelOf);
const raw = () => screen.queryByLabelText("Effective schema", { selector: "pre" });
const search = (value: string) => fireEvent.change(screen.getByLabelText("Search the schema"), { target: { value } });

describe("schemas screen", () => {
  it("asks for a connection first", () => {
    renderPage(undefined, { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("reads the schema of the default preset, in its own media type, and lists its definitions closed", async () => {
    const { paths, accepts } = renderPage();
    expect(await screen.findByRole("tree", { name: "Schema definitions" })).toBeInTheDocument();
    expect(paths).toEqual(["/presets/p/schema"]);
    expect(accepts[0]).toBe("application/schema+json");
    expect(screen.getByRole("combobox", { name: "Preset" })).toHaveValue("p 1.0");
    expect(screen.getByText("The plain preset")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 definitions");
    expect(labels()).toEqual(["Card", "Name", "profile.contact"]);
    expect(item("Card")).toHaveAttribute("aria-expanded", "false");
    expect(item("Name")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens and closes a node, and shows what a member is", async () => {
    renderPage();
    await screen.findByRole("tree");
    fireEvent.click(item("Card"));
    expect(item("Card")).toHaveAttribute("aria-expanded", "true");
    expect(labels()).toEqual(["Card", "name", "email", "Name", "profile.contact"]);
    expect(item("name")).toHaveTextContent("required");
    expect(item("name")).toHaveTextContent("→ Name");
    expect(item("email")).toHaveTextContent("format email");
    expect(item("name")).toHaveAttribute("aria-level", "2");
    fireEvent.click(item("Card"));
    expect(labels()).toEqual(["Card", "Name", "profile.contact"]);
  });

  it("opens and closes everything", async () => {
    renderPage();
    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(labels()).toEqual(["Card", "name", "email", "Name", "full", "profile.contact", "authInfo"]);
    expect(item("authInfo")).toHaveTextContent("not allowed");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(labels()).toEqual(["Card", "Name", "profile.contact"]);
  });

  it("searches, opens what leads to a match, marks it, and lets a node be closed again", async () => {
    renderPage();
    await screen.findByRole("tree");
    search("email");
    expect(screen.getByRole("status")).toHaveTextContent("1 match in 1 definition");
    expect(labels()).toEqual(["Card", "email"]);
    expect(item("email").querySelector("mark")).toHaveTextContent("email");
    fireEvent.click(item("Card"));
    expect(labels()).toEqual(["Card"]);

    search("zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Nothing matches.");
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    search("");
    expect(labels()).toEqual(["Card", "Name", "profile.contact"]);
  });

  it("can be walked with the keyboard", async () => {
    renderPage();
    await screen.findByRole("tree");
    act(() => item("Card").focus());
    const press = (key: string) => fireEvent.keyDown(tree(), { key });

    press("ArrowRight");
    expect(item("Card")).toHaveAttribute("aria-expanded", "true");
    press("ArrowRight");
    await waitFor(() => expect(item("name")).toHaveFocus());
    press("ArrowDown");
    await waitFor(() => expect(item("email")).toHaveFocus());
    press("ArrowLeft");
    await waitFor(() => expect(item("Card")).toHaveFocus());
    press("ArrowLeft");
    expect(item("Card")).toHaveAttribute("aria-expanded", "false");
    press("End");
    await waitFor(() => expect(item("profile.contact")).toHaveFocus());
    press("Home");
    await waitFor(() => expect(item("Card")).toHaveFocus());
    press("Enter");
    expect(item("Card")).toHaveAttribute("aria-expanded", "true");
  });

  it("leads from a reference to the definition it points to", async () => {
    renderPage();
    await screen.findByRole("tree");
    fireEvent.click(item("Card"));
    fireEvent.click(within(item("name")).getByRole("button", { name: "Go to Name" }));
    await waitFor(() => expect(item("Name")).toHaveFocus());
  });

  it("keeps the raw schema hidden until it is asked for", async () => {
    renderPage();
    await screen.findByRole("tree");
    expect(raw()).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Show effective schema" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(raw()).toHaveTextContent('"$defs": {');
    expect(raw()).toHaveTextContent('"rpp:preset"');
    expect(screen.getByRole("button", { name: "Hide effective schema" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide effective schema" }));
    expect(raw()).not.toBeInTheDocument();
  });

  it("reads the schema of another preset when it is chosen, and hides the raw schema again", async () => {
    const { paths } = renderPage();
    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Show effective schema" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Preset" }), { target: { value: "q 2.0" } });
    await waitFor(() => expect(paths).toEqual(["/presets/p/schema", "/presets/q/schema"]));
    expect(await screen.findByRole("button", { name: "Show effective schema" })).toBeInTheDocument();
    expect(raw()).not.toBeInTheDocument();
  });

  it("shows why a schema could not be read", async () => {
    renderPage(
      () =>
        new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Found", errors: [{ type: "t", result: "02303", reason: "No such preset" }] }), {
          status: 404,
          headers: { "Content-Type": "application/problem+json", "RPP-Code": "02303" },
        }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No such preset");
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show effective schema" })).not.toBeInTheDocument();
  });

  it("shows a document that is not a usable Preset Schema as received, with a remark", async () => {
    renderPage(() => schemaResponse(schema("p", { $schema: "http://json-schema.org/draft-07/schema#" })));
    expect(await screen.findByRole("tree")).toBeInTheDocument();
    expect(screen.getByText("This is not a document the client would validate with")).toBeInTheDocument();
    expect(labels()).toEqual(["Card", "Name", "profile.contact"]);
  });
});
