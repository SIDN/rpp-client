// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionProvider } from "@/app/ConnectionProvider";
import { useConnection } from "@/app/connection-context";
import { Providers } from "@/app/providers";
import { createTestRouter } from "@/app/router";

const discovery = (baseUrl = "https://rpp.example.test") => ({
  "@type": "discovery",
  versions: [{ version: "1.0", baseUrl }],
  environment: { name: "test", status: "stable" },
  tlds: ["example"],
  extensions: [],
  presets: [{ id: "urn:ietf:params:rpp:preset:epp-compatible", version: "1.0", defaultPreset: true, extensions: [] }],
  objects: ["domainName", "host"],
  datetime: "2026-01-01T00:00:00Z",
});

const answer = (body: unknown = discovery()) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/rpp+json", "RPP-Code": "01000" } });

function Probe() {
  const { session } = useConnection();
  return (
    <button type="button" onClick={() => void session?.transport.send({ method: "GET", target: "domainNames/example.test" })}>
      Send test request
    </button>
  );
}

function renderConnection() {
  return render(
    <Providers>
      <ConnectionProvider>
        <RouterProvider router={createTestRouter(["/connection"])} />
        <Probe />
      </ConnectionProvider>
    </Providers>,
  );
}

const address = () => screen.getByLabelText("Server hostname or TLD");
const connect = () => fireEvent.click(screen.getByRole("button", { name: /^(Connect|Reconnect)$/ }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>(async () => answer());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connection screen", () => {
  it("starts disconnected and checks the form before contacting anything", async () => {
    renderConnection();
    expect(screen.getByText("Not connected", { selector: "h2" })).toBeInTheDocument();
    connect();
    expect(await screen.findByText("Enter the host name of the RPP server")).toBeInTheDocument();
    expect(address()).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();

    type("Server hostname or TLD", "https://localhost");
    connect();
    expect(await screen.findByText(/Enter only the host name/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("connects without authentication and shows what the server offers", async () => {
    renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();

    expect(await screen.findByText("Capabilities read")).toBeInTheDocument();
    expect(screen.getByText("Using the server without credentials.")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("test, stable")).toBeInTheDocument();
    expect(screen.getByText("domainName, host")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Capabilities confirmed");
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: /Domain names/ })).toHaveTextContent("Domain names");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://rpp.example.test/.well-known/rpp");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(localStorage.getItem("rpp-client.connection") ?? "{}")).toEqual({
      baseUrl: "https://rpp.example.test",
      allowInsecureHttp: false,
      auth: { type: "none" },
      preset: { signalling: "header", selection: "default" },
    });
  });

  it("asks for a user name and password only for Basic, and never stores the password", async () => {
    renderConnection();
    expect(screen.queryByLabelText("User name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /User name and password/ }));
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    expect(await screen.findByText("Enter the user name")).toBeInTheDocument();
    expect(screen.getByText("Enter the password")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    type("User name", "registrar");
    type("Password", "hunter2");
    connect();
    expect(await screen.findByText(/Signing in as registrar/)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(localStorage.getItem("rpp-client.connection")).toContain("registrar");
    expect(localStorage.getItem("rpp-client.connection")).not.toContain("hunter2");
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("hunter2");
  });

  it("warns before Basic credentials would go over plain HTTP", () => {
    renderConnection();
    fireEvent.click(screen.getByRole("radio", { name: /User name and password/ }));
    type("Server hostname or TLD", "localhost"); type("Port", "8000"); fireEvent.click(screen.getByRole("checkbox", { name: /Allow plain HTTP/ }));
    expect(screen.getByRole("status")).toHaveTextContent("The password would travel unprotected");
  });

  it("explains a failed connection and keeps the screens unconfirmed", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("could not be read");
    expect(alert).toHaveTextContent("CORS");
    expect(screen.getByRole("banner")).toHaveTextContent("Capabilities not read");
    expect(screen.getByRole("link", { name: /Domain names/ })).toHaveTextContent("Domain names");
  });

  it("says when the address is not an RPP server", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { headers: { "Content-Type": "text/html" } }));
    renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    expect(await screen.findByRole("alert")).toHaveTextContent("not with an RPP discovery document");
  });

  it("warns when the server advertises another address, and does not follow it", async () => {
    fetchMock.mockResolvedValue(answer(discovery("https://elsewhere.example.test/rpp")));
    renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    expect(await screen.findByText("The server advertises another address")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("disconnects, and prefills the last server next time", async () => {
    const first = renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    await screen.findByText("Capabilities read");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("Not connected"));
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    first.unmount();

    renderConnection();
    expect(address()).toHaveValue("rpp.example.test");
    expect(screen.getByText("Not connected", { selector: "h2" })).toBeInTheDocument();
  });
});

describe("preset section", () => {
  const twoPresets = () => {
    const document = discovery();
    document.presets.push({ id: "org.example.rpp.preset.planets", version: "1.1", defaultPreset: false, extensions: [] });
    return document;
  };

  const lastRequestHeaders = () => {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), headers: new Headers(call?.[1]?.headers) };
  };

  async function connected() {
    fetchMock.mockImplementation(async () => answer(twoPresets()));
    renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    await screen.findByText("Capabilities read");
  }

  it("is only shown once capabilities are read", async () => {
    fetchMock.mockImplementation(async () => answer(twoPresets()));
    renderConnection();
    expect(screen.queryByRole("heading", { name: "Preset" })).not.toBeInTheDocument();
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    expect(await screen.findByRole("heading", { name: "Preset" })).toBeInTheDocument();
  });

  it("sends the default preset in the header by default, but not with discovery", async () => {
    await connected();
    expect(screen.getByRole("heading", { name: "Preset" })).toBeInTheDocument();
    expect(screen.getByText("RPP-Preset: preset=urn:ietf:params:rpp:preset:epp-compatible;version=1.0")).toBeInTheDocument();
    expect(lastRequestHeaders().headers.has("RPP-Preset")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Send test request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastRequestHeaders().url).toContain("/domainNames/example.test");
    expect(lastRequestHeaders().headers.get("RPP-Preset")).toBe("preset=urn:ietf:params:rpp:preset:epp-compatible;version=1.0");
  });

  it("changes the preset and the method for the next request and remembers them", async () => {
    await connected();
    fireEvent.change(screen.getByRole("combobox", { name: "Preset" }), { target: { value: "org.example.rpp.preset.planets@1.1" } });
    fireEvent.click(screen.getByRole("radio", { name: /Media type parameters/ }));
    expect(screen.getByText(/Accept and Content-Type: application\/rpp\+json; preset="org.example.rpp.preset.planets"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send test request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const { headers } = lastRequestHeaders();
    expect(headers.get("Accept")).toBe('application/rpp+json; preset="org.example.rpp.preset.planets"; preset-version="1.1"');
    expect(headers.has("RPP-Preset")).toBe(false);

    expect(JSON.parse(localStorage.getItem("rpp-client.connection") ?? "{}").preset).toEqual({
      signalling: "media-type",
      selection: { id: "org.example.rpp.preset.planets", version: "1.1" },
    });
  });

  it("can stop sending a preset", async () => {
    await connected();
    fireEvent.click(screen.getByRole("radio", { name: /Do not send a preset/ }));
    expect(screen.getByText("Requests carry no preset.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send test request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastRequestHeaders().headers.has("RPP-Preset")).toBe(false);
  });

  it("warns when the remembered preset is not offered by the server", async () => {
    localStorage.setItem(
      "rpp-client.connection",
      JSON.stringify({
        baseUrl: "https://rpp.example.test",
        allowInsecureHttp: false,
        auth: { type: "none" },
        preset: { signalling: "header", selection: { id: "gone", version: "2.0" } },
      }),
    );
    fetchMock.mockImplementation(async () => answer(twoPresets()));
    renderConnection();
    connect();
    expect(await screen.findByText("No preset is sent")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Not offered: gone, version 2.0" })).toBeInTheDocument();
  });

  it("forgets the chosen preset when the address changes", async () => {
    localStorage.setItem(
      "rpp-client.connection",
      JSON.stringify({
        baseUrl: "https://other.example.test",
        allowInsecureHttp: false,
        auth: { type: "none" },
        preset: { signalling: "header", selection: { id: "gone", version: "2.0" } },
      }),
    );
    fetchMock.mockImplementation(async () => answer(twoPresets()));
    renderConnection();
    type("Server hostname or TLD", "rpp.example.test");
    connect();
    await screen.findByText("Capabilities read");
    expect(screen.getByRole("combobox", { name: "Preset" })).toHaveValue("default");
    expect(screen.queryByText("No preset is sent")).not.toBeInTheDocument();
  });
});

describe("bookmarks", () => {
  const PRESET_ID = "urn:ietf:params:rpp:preset:epp-compatible";
  const BOOKMARK = {
    id: "bm-1",
    name: "Registry A",
    profile: {
      baseUrl: "https://rpp.example.test",
      allowInsecureHttp: false,
      auth: { type: "basic", username: "registrar" },
      preset: { signalling: "media-type", selection: { id: PRESET_ID, version: "1.0" } },
    },
  };
  const seed = (...bookmarks: unknown[]) => localStorage.setItem("rpp-client.bookmarks", JSON.stringify(bookmarks));
  const stored = () => JSON.parse(localStorage.getItem("rpp-client.bookmarks") ?? "[]") as { id: string; name: string; profile: { baseUrl: string } }[];
  const bar = () => within(screen.getByRole("toolbar", { name: "Bookmarks" }));
  const select = () => screen.getByRole("combobox", { name: "Bookmark" });
  const names = () => within(select()).getAllByRole("option").slice(1).map((option) => option.textContent);
  const pick = (name: string) => fireEvent.change(select(), { target: { value: (within(select()).getByRole("option", { name }) as HTMLOptionElement).value } });
  const press = (name: string) => fireEvent.click(bar().getByRole("button", { name }));
  const save = (label = "Save as a bookmark") => fireEvent.click(screen.getByRole("button", { name: label }));

  it("says there are none, and saves the form as a bookmark without the password", async () => {
    renderConnection();
    expect(screen.getByText(/No bookmarks yet/)).toBeInTheDocument();
    expect(select()).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /User name and password/ }));
    type("Server hostname or TLD", "rpp.example.test");
    type("User name", "registrar");
    type("Password", "hunter2");
    type("Connection name", "  Registry A ");
    save();

    await waitFor(() => expect(names()).toEqual(["Registry A"]));
    expect(select()).toHaveValue(stored()[0]?.id);
    expect(bar().getByText("https://rpp.example.test")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Bookmarks" })).toHaveTextContent("User registrar");
    expect(stored()).toEqual([expect.objectContaining({ name: "Registry A", profile: expect.objectContaining({ baseUrl: "https://rpp.example.test", auth: { type: "basic", username: "registrar" } }) })]);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("hunter2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a connection name and a valid address before it saves, and the name is the first field", async () => {
    renderConnection();
    expect(screen.getAllByRole("textbox")[0]).toBe(screen.getByLabelText("Connection name"));
    save();
    expect(await screen.findByText("Enter a connection name to save a bookmark")).toBeInTheDocument();
    expect(screen.getByText("Enter the host name of the RPP server")).toBeInTheDocument();
    type("Connection name", "x");
    type("Server hostname or TLD", "rpp.example.test");
    save();
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(screen.queryByText("Enter a connection name to save a bookmark")).not.toBeInTheDocument();
  });

  it("fills the form from a bookmark so that only the password is left to enter", async () => {
    seed(BOOKMARK);
    renderConnection();
    expect(bar().getByRole("button", { name: "Use" })).toBeDisabled();
    pick("Registry A");
    expect(address()).toHaveValue("");
    press("Use");

    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveFocus());
    expect(address()).toHaveValue("rpp.example.test");
    expect(screen.getByLabelText("User name")).toHaveValue("registrar");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Connection name")).toHaveValue("Registry A");
    expect(screen.getByRole("toolbar", { name: "Bookmarks" })).toHaveTextContent("In the form");

    connect();
    expect(await screen.findByText("Enter the password")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    type("Password", "hunter2");
    connect();
    expect(await screen.findByText(/Signing in as registrar/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("rpp-client.connection") ?? "{}").preset).toEqual(BOOKMARK.profile.preset);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("hunter2");
  });

  it("edits a bookmark in place, also under another name", async () => {
    seed(BOOKMARK);
    renderConnection();
    pick("Registry A");
    press("Edit");

    await waitFor(() => expect(screen.getByLabelText("Connection name")).toHaveFocus());
    expect(screen.getByLabelText("Connection name")).toHaveValue("Registry A");
    expect(screen.getByText("Editing bookmark Registry A")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Bookmarks" })).toHaveTextContent("Being edited");

    type("Server hostname or TLD", "other.example.test");
    save("Save changes to the bookmark");
    await waitFor(() => expect(stored()[0]?.profile.baseUrl).toBe("https://other.example.test"));
    expect(screen.queryByRole("group", { name: /already exists/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Editing bookmark/)).not.toBeInTheDocument();

    press("Edit");
    await waitFor(() => expect(screen.getByLabelText("Connection name")).toHaveValue("Registry A"));
    type("Connection name", "Registry B");
    save("Save changes to the bookmark");
    await waitFor(() => expect(names()).toEqual(["Registry B"]));
    expect(stored()).toEqual([expect.objectContaining({ id: "bm-1", name: "Registry B" })]);
  });

  it("asks before it overwrites a bookmark of the same name, whatever the capitals", async () => {
    seed(BOOKMARK);
    renderConnection();
    type("Connection name", "registry a");
    type("Server hostname or TLD", "other.example.test");
    save();

    const ask = await screen.findByRole("group", { name: "A bookmark named Registry A already exists" });
    expect(stored()[0]?.profile.baseUrl).toBe(BOOKMARK.profile.baseUrl);
    fireEvent.click(within(ask).getByRole("button", { name: "Do not overwrite" }));
    expect(screen.queryByRole("group", { name: /already exists/ })).not.toBeInTheDocument();
    expect(stored()[0]?.profile.baseUrl).toBe(BOOKMARK.profile.baseUrl);

    save();
    fireEvent.click(within(await screen.findByRole("group", { name: /already exists/ })).getByRole("button", { name: "Overwrite Registry A" }));
    await waitFor(() => expect(stored()[0]?.profile.baseUrl).toBe("https://other.example.test"));
    expect(stored()).toEqual([expect.objectContaining({ id: "bm-1", name: "registry a" })]);
    expect(names()).toEqual(["registry a"]);
  });

  it("asks before an edit renames a bookmark onto another, which it then replaces", async () => {
    seed(BOOKMARK, { ...BOOKMARK, id: "bm-2", name: "Registry B", profile: { ...BOOKMARK.profile, baseUrl: "https://b.example.test" } });
    renderConnection();
    pick("Registry A");
    press("Edit");
    await waitFor(() => expect(screen.getByLabelText("Connection name")).toHaveValue("Registry A"));
    type("Connection name", "Registry B");
    save("Save changes to the bookmark");
    fireEvent.click(within(await screen.findByRole("group", { name: "A bookmark named Registry B already exists" })).getByRole("button", { name: "Overwrite Registry B" }));

    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0]).toMatchObject({ id: "bm-1", name: "Registry B", profile: { baseUrl: BOOKMARK.profile.baseUrl } });
  });

  it("deletes a bookmark only after confirmation", async () => {
    seed(BOOKMARK, { ...BOOKMARK, id: "bm-2", name: "Registry B" });
    renderConnection();
    pick("Registry A");
    press("Delete");
    press("Do not do it");
    expect(stored()).toHaveLength(2);
    expect(screen.queryByRole("group", { name: /Delete the bookmark/ })).not.toBeInTheDocument();

    press("Delete");
    press("Delete Registry A");
    await waitFor(() => expect(names()).toEqual(["Registry B"]));
    expect(stored().map((bookmark) => bookmark.name)).toEqual(["Registry B"]);
    expect(select()).toHaveValue("");
    expect(bar().getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("ignores stored entries that are not bookmarks, or whose name is taken", () => {
    seed(BOOKMARK, { id: "bm-2", name: "No profile" }, { id: "bm-3", name: "Plain HTTP", profile: { ...BOOKMARK.profile, baseUrl: "http://rpp.example.test" } }, { ...BOOKMARK, id: "bm-4", name: "REGISTRY a" }, "junk");
    renderConnection();
    expect(names()).toEqual(["Registry A"]);
  });
});
