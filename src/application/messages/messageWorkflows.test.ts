import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import { RppError } from "@/rpp/errors/RppError";
import { createRppClient } from "@/rpp/operations/RppClient";
import { createMessageWorkflows } from "./messageWorkflows";

const BASE = "https://rpp.example.test/rpp";

function setup(body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status: 200,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }), "RPP-Code": "01301" },
      }),
  );
  const workflows = createMessageWorkflows(createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) }));
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return { method: init?.method, path: `${(url as URL).pathname}${(url as URL).search}` };
  };
  return { workflows, last, fetchMock };
}

const MESSAGES = Array.from({ length: 40 }, (_, index) => ({ "@type": "message", id: `M-${index + 1}`, status: "delivered", data: { "@type": "serviceNoticeMessage", message: "x" } }));

describe("message workflows", () => {
  it("retrieves the messages of any type with GET, and expects many", async () => {
    const { workflows, last } = setup(MESSAGES);
    const result = await workflows.retrieve();
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/messages" });
    expect(result.data).toHaveLength(40);
  });

  it("asks for one type only when told to, and for several by repeating the parameter", async () => {
    const { workflows, last } = setup(MESSAGES);
    await workflows.retrieve(["transferRequestMessage"]);
    expect(last().path).toBe("/rpp/messages?type=transferRequestMessage");
    await workflows.retrieve(["a", "b"]);
    expect(last().path).toBe("/rpp/messages?type=a&type=b");
  });

  it("takes a lone message as a list of one, and no answer as none", async () => {
    expect((await setup(MESSAGES[0]).workflows.retrieve()).data).toEqual([MESSAGES[0]]);
    expect((await setup(undefined).workflows.retrieve()).data).toEqual([]);
  });

  it("acknowledges a message with DELETE and no body, encoding its identifier", async () => {
    const { workflows, last } = setup(undefined);
    await workflows.acknowledge("M 1/2");
    expect(last()).toMatchObject({ method: "DELETE", path: "/rpp/messages/M%201%2F2" });
  });

  it("does not send an acknowledgement without an identifier", async () => {
    const { workflows, fetchMock } = setup(undefined);
    await expect(workflows.acknowledge("")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
