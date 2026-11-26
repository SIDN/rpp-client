// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { ExchangesPage } from "../exchanges/ExchangesPage";
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

  it("sends standard headers typed in their own box, replacing the client's", async () => {
    const calls = renderPage(answer);
    fireEvent.change(screen.getByLabelText("Path or address"), { target: { value: "domainNames" } });
    fireEvent.change(screen.getByLabelText("Extra headers"), { target: { value: "Accept: application/json" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText(/Accept is set by the client/)).toBeInTheDocument();

    expect(screen.queryByLabelText("Standard headers")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Set the standard headers myself/));
    fireEvent.change(screen.getByLabelText("Extra headers"), { target: { value: "X-Trace: t1" } });
    fireEvent.change(screen.getByLabelText("Standard headers"), { target: { value: "Accept: application/json\nAuthorization: Bearer typed\nRPP-Cltrid: H-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.headers.get("accept")).toBe("application/json");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer typed");
    expect(calls[0]?.headers.get("rpp-cltrid")).toBe("H-1");
    expect(calls[0]?.headers.get("x-trace")).toBe("t1");
    const exchange = await screen.findByRole("region", { name: "Exchange" });
    expect(within(exchange).getByRole("table", { name: "Request headers" })).toHaveTextContent("authorization[REDACTED]");
    expect(exchange.textContent).not.toContain("Bearer typed");
  });

  describe("started from a recorded exchange", () => {
    function renderFrom(initialPath: string, prepare: (session: ReturnType<typeof createSession>) => Promise<void>) {
      const calls: Request[] = [];
      const session = createSession(PROFILE, { password: "hunter2" }, { fetch: async (input, init) => {
        const request = new Request(input, init);
        calls.push(request);
        return answer();
      } });
      return {
        calls,
        session,
        render: async () => {
          await prepare(session);
          render(
            <MemoryRouter initialEntries={[initialPath]}>
              <ConnectionContext.Provider value={{ session } as ConnectionApi}>
                <Routes>
                  <Route path="/developer/exchanges" element={<ExchangesPage />} />
                  <Route path="/developer/requests" element={<RawRequestPage />} />
                </Routes>
              </ConnectionContext.Provider>
            </MemoryRouter>,
          );
        },
      };
    }

    it("opens from the Exchanges screen with the same request data, redacted values included", async () => {
      const page = renderFrom("/developer/exchanges", async (session) => {
        await session.transport.send({
          method: "POST",
          target: "domainNames",
          query: { token: "abc", a: "1" },
          headers: { "X-Trace": "t1" },
          body: { name: "example.test", authInfo: "s3cret" },
          clientTransactionId: "T-1",
        });
      });
      await page.render();
      fireEvent.click(screen.getByRole("link", { name: "Open as raw request" }));

      expect(screen.getByText(/Filled in from exchange/)).toBeInTheDocument();
      expect(screen.getByText(/sent like that unless you replace them/)).toBeInTheDocument();
      expect(screen.getByLabelText("Method")).toHaveValue("POST");
      expect(screen.getByLabelText("Path or address")).toHaveValue("domainNames");
      expect(screen.getByLabelText("Query parameters")).toHaveValue("token=[REDACTED]\na=1");
      expect(screen.getByLabelText("Extra headers")).toHaveValue("x-trace: t1");
      expect(screen.getByLabelText("Body")).toHaveValue('{"name":"example.test","authInfo":"[REDACTED]"}');
      expect(screen.getByLabelText("RPP-Cltrid")).toHaveValue("T-1");
      expect(screen.getByLabelText(/Send the credentials/)).toBeChecked();
      expect(screen.getByLabelText(/Set the standard headers myself/)).toBeChecked();
      expect(screen.getByLabelText("Standard headers")).toHaveValue("accept: application/rpp+json\ncontent-type: application/rpp+json");
      expect(document.body.innerHTML).not.toContain("s3cret");
      expect(document.body.innerHTML).not.toContain("hunter2");

      fireEvent.click(screen.getByRole("button", { name: "Send request" }));
      await waitFor(() => expect(page.calls).toHaveLength(2));
      const resent = page.calls[1];
      expect(resent?.url).toBe("https://rpp.example.test/rpp/domainNames?token=%5BREDACTED%5D&a=1");
      expect(await resent?.text()).toBe('{"name":"example.test","authInfo":"[REDACTED]"}');
      expect(resent?.headers.get("rpp-cltrid")).toBe("T-1");
      expect(resent?.headers.get("authorization")).toMatch(/^Basic /);
      expect(resent?.headers.get("accept")).toBe("application/rpp+json");
    });

    it("says so and starts empty when the exchange is no longer recorded", async () => {
      const page = renderFrom("/developer/requests?exchange=gone", async () => undefined);
      await page.render();
      expect(screen.getByText("Exchange gone is no longer recorded")).toBeInTheDocument();
      expect(screen.getByLabelText("Path or address")).toHaveValue("");
    });
  });
});
