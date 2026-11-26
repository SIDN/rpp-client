import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { createSession } from "./session";

const PROFILE = { baseUrl: "https://rpp.example.test", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS } as const;

const hang: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

describe("session timeout", () => {
  it("gives up on a request after the timeout it is given, read afresh for each request", async () => {
    let timeoutMs = 10_000;
    const session = createSession(PROFILE, undefined, { fetch: hang, timeoutMs: () => timeoutMs });

    timeoutMs = 10;
    await expect(session.transport.send({ method: "GET", target: "a" })).rejects.toMatchObject({ kind: "timeout" });
  });
});
