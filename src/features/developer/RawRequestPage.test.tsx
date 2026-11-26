// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { RawRequestPage } from "./RawRequestPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS } as const;

function renderPage(respond: (request: Request) => Response | Promise<Response>, withSession = true) {
  const calls: Request[] = [];
  const session = createSession(PROFILE, { password: "hunter2" }, { fetch: async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    return respond(request);
  } });
  render(
    <MemoryRouter>
      <ConnectionContext.Provider value={{ session: withSession ? session : undefined } as ConnectionApi}>
        <RawRequestPage />
      </ConnectionContext.Provider>
    </MemoryRouter>,
  );
  return calls;
}

const answer = () => new Response(JSON.stringify({ name: "example.test" }), { headers: { "Content-Type": "application/rpp+json", "RPP-Code": "01000" } });

describe("raw request screen", () => {
  it("asks for a connection when there is none", () => {
    renderPage(answer, false);
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("sends the request as typed and shows the exchange", async () => {
    const calls = renderPage(answer);
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "POST" } });
    fireEvent.change(screen.getByLabelText("Path or address"), { target: { value: "domainNames" } });
    fireEvent.change(screen.getByLabelText("Query parameters"), { target: { value: "a=1" } });
    fireEvent.change(screen.getByLabelText("Extra headers"), { target: { value: "X-Trace: t1" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: '{"name":"example.test"}' } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://rpp.example.test/rpp/domainNames?a=1");
    expect(calls[0]?.headers.get("x-trace")).toBe("t1");
    expect(await screen.findByRole("region", { name: "Exchange" })).toHaveTextContent("200");
    expect(await screen.findByLabelText("Response body, formatted")).toHaveTextContent("example.test");
  });

  it("sends nothing and says why when the form cannot be sent", () => {
    const calls = renderPage(answer);
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "{oops" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText(/The body is not valid JSON/)).toBeInTheDocument();
    expect(screen.getByText(/Enter a path/)).toBeInTheDocument();
  });

  it("shows a failure without a response", async () => {
    renderPage(() => {
      throw new TypeError("Failed to fetch");
    });
    fireEvent.change(screen.getByLabelText("Path or address"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/No response: /)).toBeInTheDocument();
  });

  it("fills the form with the chosen sample, ready to edit and send", async () => {
    const calls = renderPage(answer);
    fireEvent.change(screen.getByLabelText("Sample request"), { target: { value: "domain-patch" } });
    expect(screen.getByLabelText("Method")).toHaveValue("PATCH");
    expect(screen.getByLabelText("Path or address")).toHaveValue("domainNames/example.nl");
    const body = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(JSON.parse(body.value)).toEqual(expect.arrayContaining([expect.objectContaining({ op: "add", path: "/nameservers" })]));
    fireEvent.change(body, { target: { value: body.value.replace("ns2.example.nl", "ns9.example.nl") } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await calls[0]?.text()).toContain("ns9.example.nl");
  });
});
